/**
 * Shared request handling for every /api/* endpoint: method and input
 * validation, short-lived caching, and a consistent JSON error format.
 *
 * Success responses are the upstream JSON unchanged, so the frontend keeps the
 * shapes it already understands. Error responses are always:
 *
 *   { "error": { "code": "...", "message": "...", "upstreamStatus": 403 } }
 */

import { fetchResource, ProviderError } from "./provider.js";

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
 * `deps` lets tests inject a fake fetch, environment and clock.
 */
export function createHandler(resource, deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const now = deps.now || Date.now;

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");

      return sendError(
        res,
        new ProviderError(
          "method_not_allowed",
          "Only GET is supported.",
          405
        )
      );
    }

    const id = parseEventId(req.query?.id);

    if (!id) {
      return sendError(
        res,
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

      return res.status(200).json(data);
    } catch (error) {
      if (error instanceof ProviderError) {
        return sendError(res, error);
      }

      console.error(`[api/${resource}] unexpected error`, error);

      return sendError(
        res,
        new ProviderError(
          "internal_error",
          "Unexpected server error.",
          500
        )
      );
    }
  };
}

/** Test helper: clear the in-memory cache between tests. */
export function clearCache() {
  cache.clear();
}
