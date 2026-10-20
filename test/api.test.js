import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createHandler, clearCache, parseEventId } from "../api/_lib/handler.js";
import { fetchResource, ProviderError } from "../api/_lib/provider.js";

/* ---------- helpers ---------- */

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  return res;
}

function upstream(status, body, headers = {}) {
  return async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers
    });
}

async function call(resource, { id, method = "GET", fetchImpl, env = {}, now } = {}) {
  const handler = createHandler(resource, {
    fetchImpl,
    env: { CACHE_TTL_SECONDS: "0", ...env },
    now
  });
  const res = mockRes();

  await handler({ method, query: id === undefined ? {} : { id } }, res);

  return res;
}

beforeEach(() => clearCache());

/* ---------- input validation ---------- */

test("parseEventId accepts positive integers only", () => {
  assert.equal(parseEventId("16363646"), "16363646");
  assert.equal(parseEventId("1"), "1");

  for (const bad of ["", "0", "007", "-5", "1.5", "abc", "12 34", "1e5", "../x", "1234567890123", undefined, null, 42]) {
    assert.equal(parseEventId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

for (const resource of ["event", "incidents", "statistics", "graph"]) {
  test(`${resource}: missing id -> 400 invalid_event_id, upstream never called`, async () => {
    let called = false;
    const res = await call(resource, {
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "invalid_event_id");
    assert.equal(called, false);
  });

  test(`${resource}: non-numeric id -> 400`, async () => {
    const res = await call(resource, { id: "abc" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, "invalid_event_id");
  });

  test(`${resource}: POST -> 405`, async () => {
    const res = await call(resource, { id: "1", method: "POST" });
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error.code, "method_not_allowed");
    assert.equal(res.headers.allow, "GET, HEAD");
  });
}

/* ---------- success path / routing ---------- */

test("each resource requests the matching upstream path and passes JSON through", async () => {
  const expected = {
    event: "/event/123",
    incidents: "/event/123/incidents",
    statistics: "/event/123/statistics",
    graph: "/event/123/graph"
  };

  for (const [resource, path] of Object.entries(expected)) {
    let requested;
    const payload = { resource, ok: true };
    const res = await call(resource, {
      id: "123",
      env: { UPSTREAM_BASE_URL: "https://provider.example/v1/" },
      fetchImpl: async (url) => {
        requested = url;
        return new Response(JSON.stringify(payload));
      }
    });

    assert.equal(requested, `https://provider.example/v1${path}`);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, payload);
  }
});

/* ---------- upstream error mapping ---------- */

test("upstream 404 -> 404 event_not_found (the only 'not found')", async () => {
  const res = await call("event", { id: "1", fetchImpl: upstream(404, { error: "x" }) });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.code, "event_not_found");
});

for (const status of [401, 403]) {
  test(`upstream ${status} -> 502 upstream_access_denied, NOT event_not_found`, async () => {
    const res = await call("event", { id: "1", fetchImpl: upstream(status, { error: "denied" }) });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error.code, "upstream_access_denied");
    assert.equal(res.body.error.upstreamStatus, status);
    assert.notEqual(res.body.error.code, "event_not_found");
    assert.doesNotMatch(res.body.error.message, /not found/i);
  });
}

test("upstream 429 -> 429 upstream_rate_limited and forwards Retry-After", async () => {
  const res = await call("event", {
    id: "1",
    fetchImpl: upstream(429, {}, { "retry-after": "30" })
  });
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error.code, "upstream_rate_limited");
  assert.equal(res.headers["retry-after"], "30");
});

test("upstream 500/503 -> 502 upstream_error", async () => {
  for (const status of [500, 503]) {
    const res = await call("graph", { id: "1", fetchImpl: upstream(status, {}) });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error.code, "upstream_error");
    assert.equal(res.body.error.upstreamStatus, status);
  }
});

test("unexpected upstream status (e.g. 418) -> 502 upstream_unexpected_status", async () => {
  const res = await call("event", { id: "1", fetchImpl: upstream(418, {}) });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, "upstream_unexpected_status");
});

test("timeout -> 504 upstream_timeout", async () => {
  const res = await call("event", {
    id: "1",
    fetchImpl: async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    }
  });
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error.code, "upstream_timeout");
});

test("a real slow upstream is aborted by UPSTREAM_TIMEOUT_MS", async () => {
  const slowFetch = (url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });

  const started = Date.now();
  const res = await call("event", {
    id: "1",
    env: { UPSTREAM_TIMEOUT_MS: "50" },
    fetchImpl: slowFetch
  });

  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error.code, "upstream_timeout");
  assert.ok(Date.now() - started < 2000);
});

test("network failure -> 502 upstream_unreachable", async () => {
  const res = await call("event", {
    id: "1",
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    }
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, "upstream_unreachable");
});

test("200 with non-JSON body -> 502 upstream_invalid_response", async () => {
  const res = await call("event", { id: "1", fetchImpl: upstream(200, "<html>captcha</html>") });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, "upstream_invalid_response");
});

test("every error uses the same shape and is never cached", async () => {
  const res = await call("event", { id: "1", fetchImpl: upstream(403, {}) });
  assert.deepEqual(Object.keys(res.body), ["error"]);
  assert.ok(res.body.error.code && res.body.error.message);
  assert.equal(res.headers["cache-control"], "no-store");
});

/* ---------- honest requests (no spoofing) ---------- */

test("upstream request does not impersonate a browser or SofaScore", async () => {
  let init;
  await fetchResource("1", "event", {
    env: {},
    fetchImpl: async (url, options) => {
      init = options;
      return new Response("{}");
    }
  });

  const headers = Object.fromEntries(
    Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  assert.match(headers["user-agent"], /^PitchBoard\//);
  assert.doesNotMatch(headers["user-agent"], /Mozilla|Chrome|Safari/i);
  assert.equal(headers.referer, undefined);
  assert.equal(headers.origin, undefined);
  assert.equal(headers.authorization, undefined);
});

test("UPSTREAM_API_KEY is sent as a bearer token only when configured", async () => {
  let init;
  await fetchResource("1", "event", {
    env: { UPSTREAM_API_KEY: "secret-key" },
    fetchImpl: async (url, options) => {
      init = options;
      return new Response("{}");
    }
  });

  assert.equal(init.headers.Authorization, "Bearer secret-key");
});

test("unknown resource is rejected by the provider", async () => {
  await assert.rejects(
    () => fetchResource("1", "bogus", { fetchImpl: upstream(200, {}) }),
    (error) => error instanceof ProviderError && error.code === "unknown_resource"
  );
});

/* ---------- caching ---------- */

test("successful responses are cached for CACHE_TTL_SECONDS, then refetched", async () => {
  let calls = 0;
  let clock = 1_000_000;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ n: calls }));
  };
  const options = { id: "9", fetchImpl, env: { CACHE_TTL_SECONDS: "10" }, now: () => clock };

  const first = await call("event", options);
  assert.equal(first.headers["x-cache"], "MISS");
  assert.equal(first.body.n, 1);

  clock += 5_000;
  const second = await call("event", options);
  assert.equal(second.headers["x-cache"], "HIT");
  assert.equal(second.body.n, 1);
  assert.equal(calls, 1);

  clock += 6_000;
  const third = await call("event", options);
  assert.equal(third.headers["x-cache"], "MISS");
  assert.equal(third.body.n, 2);
  assert.match(third.headers["cache-control"], /s-maxage=10/);
});

test("errors are not cached: a later success is served after a failure", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? new Response("{}", { status: 503 })
      : new Response(JSON.stringify({ ok: true }));
  };
  const options = { id: "5", fetchImpl, env: { CACHE_TTL_SECONDS: "30" } };

  assert.equal((await call("event", options)).statusCode, 502);
  assert.equal((await call("event", options)).statusCode, 200);
});

test("CACHE_TTL_SECONDS=0 disables caching", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("{}");
  };

  await call("event", { id: "7", fetchImpl, env: { CACHE_TTL_SECONDS: "0" } });
  const res = await call("event", { id: "7", fetchImpl, env: { CACHE_TTL_SECONDS: "0" } });

  assert.equal(calls, 2);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("cache is keyed by resource and id", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("{}");
  };
  const env = { CACHE_TTL_SECONDS: "30" };

  await call("event", { id: "1", fetchImpl, env });
  await call("event", { id: "2", fetchImpl, env });
  await call("incidents", { id: "1", fetchImpl, env });

  assert.equal(calls, 3);
});
