# PitchBoard

A compact dashboard for watching up to four football matches on one screen.

- **Frontend:** static HTML / CSS / vanilla JS (`index.html`, `styles.css`, `app.js`). No build step.
- **Backend:** four [Vercel Functions](https://vercel.com/docs/functions) under `api/`. There is no other server, database or Docker image.

```
Browser ──► /api/{event|incidents|statistics|graph}?id=N   (same origin, Vercel Functions)
              └─► api/_lib/handler.js   validation, cache, error format
                    └─► api/_lib/provider.js   the only code that talks to the data source
Browser ──► sofascore.com live-match-tracker (iframe, independent of /api)
```

The live tracker iframe loads straight from SofaScore and does not depend on the API. Team names, scores, status, statistics, incidents and the momentum bar do.

## API

All endpoints are `GET /api/<name>?id=<eventId>`. `eventId` must be a positive whole number.

| Endpoint | Upstream resource | Used for |
|---|---|---|
| `/api/event` | `/event/{id}` | teams, logos, score, status, competition, goal alerts |
| `/api/incidents` | `/event/{id}/incidents` | goals, cards, substitutions |
| `/api/statistics` | `/event/{id}/statistics` | possession, shots, corners |
| `/api/graph` | `/event/{id}/graph` | momentum bar |

Success responses are the provider's JSON, unchanged. Errors always look like:

```json
{ "error": { "code": "upstream_access_denied", "message": "...", "upstreamStatus": 403 } }
```

| HTTP | `error.code` | Meaning |
|---|---|---|
| 400 | `invalid_event_id` | `id` missing or not a positive integer |
| 404 | `event_not_found` | the provider answered 404. **The only case reported as "not found".** |
| 405 | `method_not_allowed` | not GET/HEAD |
| 429 | `upstream_rate_limited` | provider returned 429 (`Retry-After` is forwarded) |
| 502 | `upstream_access_denied` | provider returned 401/403 |
| 502 | `upstream_error` | provider returned 5xx |
| 502 | `upstream_unreachable` / `upstream_invalid_response` / `upstream_unexpected_status` | network failure, non-JSON body, other status |
| 504 | `upstream_timeout` | provider did not answer within `UPSTREAM_TIMEOUT_MS` |

Errors are sent with `Cache-Control: no-store`. Successes are cached for a short time (see below).

The frontend requests the four resources independently, so a failure in one (say statistics) still shows the others and the card reports `Partial update: statistics unavailable`.

## Environment variables

All optional. Nothing secret is committed.

| Variable | Default | Purpose |
|---|---|---|
| `UPSTREAM_BASE_URL` | `https://www.sofascore.com/api/v1` | Base URL of the data provider. Paths `/event/{id}[/incidents\|/statistics\|/graph]` are appended. |
| `UPSTREAM_API_KEY` | _(unset)_ | If set, sent as `Authorization: Bearer <key>`. For a licensed provider. |
| `UPSTREAM_TIMEOUT_MS` | `8000` | Per-request upstream timeout. |
| `CACHE_TTL_SECONDS` | `10` | In-function cache and CDN `s-maxage`. `0` disables caching. |

## Data access: read this before deploying

SofaScore does not publish an official public API. The default `UPSTREAM_BASE_URL` points at its **unofficial web endpoints**, which have been reported to answer HTTP 403 to server-side requests, and whose terms may not permit automated use.

This project deliberately does **not** work around that. The provider sends an honest `User-Agent` and does not fake browser headers, `Referer` or `Origin`. If SofaScore refuses the request, the dashboard shows **"Data provider denied access"** instead of fake data or a misleading "not found".

If the default source is refused, the options are:

1. Use a **licensed or officially supported sports-data API** whose terms allow this use, and set `UPSTREAM_BASE_URL` (and `UPSTREAM_API_KEY`). If its JSON shapes differ from SofaScore's, adapt `api/_lib/provider.js`; the handlers and frontend stay the same.
2. Keep only the tracker iframes. They work without any API, and the metadata panels will show the access error.
3. Ask SofaScore about an authorized data arrangement.

Whether a given source works from Vercel's servers can only be confirmed by deploying and calling it (see below).

## Deploy to Vercel

1. Import the GitHub repository in Vercel. Framework preset: **Other**. No build command, no output directory (the repo root is served as-is).
2. Optionally add the environment variables above (Project → Settings → Environment Variables).
3. Deploy, then verify from your own machine:

```bash
curl -i "https://<your-domain>/api/event?id=<a real event id>"   # 200 + JSON, or a clear error code
curl -i "https://<your-domain>/api/event?id=abc"                  # 400 invalid_event_id
```

Node 20 or newer is required (`package.json` → `engines`). `package.json` has `"type": "module"` so the functions use ES modules; there are no dependencies.

Files under `api/_lib/` start with an underscore, so Vercel does not expose them as endpoints.

## Local development and tests

```bash
npm run check   # syntax-check the frontend and API files
npm test        # API unit tests (Node's built-in runner, mocked upstream, no network)
```

To try it locally with real functions, use the Vercel CLI (`npx vercel dev`).

## Using the dashboard

Pick a layout (1×1, 1×2, 2×2), type an event ID into a match slot in the sidebar and press **Go** or Enter. Event IDs and the layout are remembered in the browser. Double-click a match header to toggle fullscreen; press Esc to leave it. Data refreshes every 10 seconds.
