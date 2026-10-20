/**
 * Shared request handling for every /api/* endpoint: method and input
 * validation, short-lived caching, structured logging and a consistent JSON
 * error format.
 *
 * Success responses are the upstream JSON unchanged, so the frontend keeps the
 * shapes it already understands. Error responses are always:
 *
 *   { "error": { "code": "...", "message": "...", "upstreamStatus": 403 } }
 *
 * Every response carries:
 *   X-PitchBoard-Handler  identifies this error-aware implementation, so
 *                         `curl -i` shows whether the new code is deployed
 *   X-Request-Id          matches the `requestId` field in the function logs
 *
 * Logging: one JSON line per request on stdout/stderr (Vercel → Logs).
 * LOG_LEVEL=info (default) logs every request, warn logs problems only,
 * off disables logging. Secrets are never logged (see provider.js).
 */

import { randomUUID } from "node:crypto";

import { fetchResource, ProviderError } from "./provider.js";

export const HANDLER_VERSION = "error-aware-v2";

const MAX_CACHE_ENTRIES = 500;

/** Per-instance micro-cache. Best effort only: serverless instances come and go. */
const cache = new Map();

/** Positive integer, no leading zeros, bounded length. */
export function parseEventId(value) {
  const id = Array.isArray(value) ? value[0] : value;

  if (typeof id !== "string" || !/^[1-9][0-9]{0,11}$/.test(id)) {
    return null;
  }

  return id;
}

function getCacheTtlSeconds(env) {
  const ttl = Number(env.CACHE_TTL_SECONDS);

  return Number.isFinite(ttl) && ttl >= 0 ? ttl : 10;
}

/* ---------- logging ---------- */

const LEVELS = { info: 0, warn: 1, error: 2 };

function defaultLog(level, entry) {
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function deploymentContext(env) {
  const context = {};

  if (env.VERCEL_ENV) context.vercelEnv = env.VERCEL_ENV;
  if (env.VERCEL_REGION) context.region = env.VERCEL_REGION;
  if (env.VERCEL_GIT_COMMIT_SHA) {
    context.commit = env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }

  return context;
}

function makeLogger(env, sink) {
  const setting = String(env.LOG_LEVEL || "info").toLowerCase();

  if (setting === "off") {
    return () => {};
  }

  const threshold = LEVELS[setting] ?? LEVELS.info;

  return (level, entry) => {
    if (LEVELS[level] >= threshold) {
      sink(level, entry);
    }
  };
}

/* ---------- responses ---------- */

function sendError(res, error) {
  const body = {
    error: {
      code: error.code,
      message: error.message
    }
  };

  if (error.upstreamStatus) {
    body.error.upstreamStatus = error.upstreamStatus;
  }

  res.setHeader("Cache-Control", "no-store");

  if (error.retryAfter) {
    res.setHeader("Retry-After", error.retryAfter);
  }

  return res.status(error.httpStatus).json(body);
}

/**
 * Build a Vercel Function handler for one resource.
 * `deps` lets tests inject a fake fetch, environment, clock and log sink.
 */
export function createHandler(resource, deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const now = deps.now || Date.now;
    const log = makeLogger(env, deps.log || defaultLog);

    const requestId = randomUUID();
    const startedAt = now();

    res.setHeader("X-PitchBoard-Handler", HANDLER_VERSION);
    res.setHeader("X-Request-Id", requestId);

    const base = () => ({
      service: "pitchboard-api",
      handler: HANDLER_VERSION,
      requestId,
      resource,
      eventId: req.query?.id ?? null,
      method: req.method,
      durationMs: now() - startedAt,
      ...deploymentContext(env)
    });

    const fail = (error, extra = {}) => {
      const level = error.httpStatus >= 500 ? "error" : "warn";

      log(level, {
        ...base(),
        outcome: "error",
        httpStatus: error.httpStatus,
        errorCode: error.code,
        upstreamStatus: error.upstreamStatus,
        ...(error.diagnostics || {}),
        ...extra
      });

      return sendError(res, error);
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");

      return fail(
        new ProviderError(
          "method_not_allowed",
          "Only GET is supported.",
          405
        )
      );
    }

    const id = parseEventId(req.query?.id);

    if (!id) {
      return fail(
        new ProviderError(
          "invalid_event_id",
          "Event ID must be a positive whole number, e.g. ?id=16363646.",
          400
        )
      );
    }

    const ttl = getCacheTtlSeconds(env);
    const key = `${resource}:${id}`;
    const hit = cache.get(key);

    if (hit && hit.expires > now()) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
      );

      log("info", {
        ...base(),
        outcome: "ok",
        httpStatus: 200,
        cache: "HIT"
      });

      return res.status(200).json(hit.data);
    }

    try {
      const data = await fetchResource(id, resource, {
        fetchImpl: deps.fetchImpl,
        env
      });

      if (ttl > 0) {
        if (cache.size >= MAX_CACHE_ENTRIES) {
          cache.delete(cache.keys().next().value);
        }

        cache.set(key, { data, expires: now() + ttl * 1000 });
      }

      res.setHeader("X-Cache", "MISS");
      res.setHeader(
        "Cache-Control",
        ttl > 0
          ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
          : "no-store"
      );

      log("info", {
        ...base(),
        outcome: "ok",
        httpStatus: 200,
        cache: "MISS"
      });

      return res.status(200).json(data);
    } catch (error) {
      if (error instanceof ProviderError) {
        return fail(error);
      }

      return fail(
        new ProviderError(
          "internal_error",
          "Unexpected server error.",
          500
        ),
        { exception: `${error?.name}: ${String(error?.message).slice(0, 300)}` }
      );
    }
  };
}

/** Test helper: clear the in-memory cache between tests. */
export function clearCache() {
  cache.clear();
}
