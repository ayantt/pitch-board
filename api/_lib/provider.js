/**
 * Upstream data provider boundary.
 *
 * This is the ONLY module that knows where match data comes from. To switch to
 * a licensed or otherwise authorized data source, change UPSTREAM_BASE_URL (and
 * UPSTREAM_API_KEY if the provider needs one) or replace RESOURCE_PATHS /
 * buildHeaders below. The handlers and the frontend do not need to change as
 * long as the provider returns the same JSON shapes.
 *
 * IMPORTANT: this module deliberately sends an honest, identifying request.
 * It does not spoof a browser User-Agent, Referer or Origin, and it does not
 * try to evade anti-bot protection. If the upstream refuses the request, the
 * refusal is reported to the caller as-is (see ProviderError).
 *
 * Note: SofaScore does not publish an official public API. The default base
 * URL points at its unofficial web JSON endpoints, which may refuse
 * server-side requests and whose terms of use may not permit automated access.
 * Confirm you are allowed to use a given source before relying on it.
 */

const DEFAULT_BASE_URL = "https://www.sofascore.com/api/v1";
const DEFAULT_TIMEOUT_MS = 8000;

/** Public resource name -> path under /event/{id}. */
export const RESOURCE_PATHS = {
  event: "",
  incidents: "/incidents",
  statistics: "/statistics",
  graph: "/graph"
};

/**
 * Error with a stable machine-readable code, the HTTP status to return to our
 * own client, and (when relevant) the status the upstream gave us.
 */
export class ProviderError extends Error {
  constructor(code, message, httpStatus, upstreamStatus, retryAfter) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamStatus = upstreamStatus ?? null;
    this.retryAfter = retryAfter ?? null;
  }
}

function getConfig(env = process.env) {
  const timeout = Number(env.UPSTREAM_TIMEOUT_MS);

  return {
    baseUrl: (env.UPSTREAM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: env.UPSTREAM_API_KEY || "",
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS
  };
}

function buildHeaders(config) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "PitchBoard/1.0 (+https://github.com/ayantt/pitch-board)"
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

/** Translate an upstream HTTP status into our error model. */
function errorForStatus(status, response) {
  if (status === 404) {
    return new ProviderError(
      "event_not_found",
      "The data provider has no event with this ID.",
      404,
      status
    );
  }

  if (status === 401 || status === 403) {
    return new ProviderError(
      "upstream_access_denied",
      "The data provider refused this server's request " +
        `(HTTP ${status}). This is an access problem, not a missing event.`,
      502,
      status
    );
  }

  if (status === 429) {
    return new ProviderError(
      "upstream_rate_limited",
      "The data provider is rate limiting requests. Try again shortly.",
      429,
      status,
      response.headers.get("retry-after")
    );
  }

  if (status >= 500) {
    return new ProviderError(
      "upstream_error",
      `The data provider had a server error (HTTP ${status}).`,
      502,
      status
    );
  }

  return new ProviderError(
    "upstream_unexpected_status",
    `The data provider returned an unexpected status (HTTP ${status}).`,
    502,
    status
  );
}

/**
 * Fetch one resource for one event. Resolves with parsed JSON or throws
 * ProviderError. `fetchImpl` and `env` are injectable for tests.
 */
export async function fetchResource(
  eventId,
  resource,
  { fetchImpl = globalThis.fetch, env = process.env } = {}
) {
  const suffix = RESOURCE_PATHS[resource];

  if (suffix === undefined) {
    throw new ProviderError(
      "unknown_resource",
      `Unknown resource "${resource}".`,
      500
    );
  }

  const config = getConfig(env);
  const url = `${config.baseUrl}/event/${eventId}${suffix}`;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  try {
    let response;

    try {
      response = await fetchImpl(url, {
        headers: buildHeaders(config),
        signal: controller.signal
      });
    } catch (error) {
      if (timedOut || (error && error.name === "TimeoutError")) {
        throw new ProviderError(
          "upstream_timeout",
          `The data provider did not respond within ${config.timeoutMs} ms.`,
          504
        );
      }

      throw new ProviderError(
        "upstream_unreachable",
        "Could not reach the data provider.",
        502
      );
    }

    if (!response.ok) {
      throw errorForStatus(response.status, response);
    }

    // The timer stays armed while the body downloads, so a stalled body
    // is also reported as a timeout rather than hanging the function.
    try {
      return await response.json();
    } catch {
      if (timedOut) {
        throw new ProviderError(
          "upstream_timeout",
          `The data provider did not respond within ${config.timeoutMs} ms.`,
          504
        );
      }

      throw new ProviderError(
        "upstream_invalid_response",
        "The data provider returned a response that was not valid JSON.",
        502,
        response.status
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
