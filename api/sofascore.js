/**
 * Vercel serverless proxy for SofaScore API.
 *
 * Forwards requests to SofaScore with appropriate headers so the
 * browser's same-origin restrictions and SofaScore's bot-detection
 * do not block data fetches in production.
 *
 * Usage: /api/sofascore?path=/event/12345/incidents
 */

const ALLOWED_PREFIX = "/event/";

const SOFASCORE_BASE = "https://www.sofascore.com/api/v1";

const PROXY_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
    "Cache-Control": "no-cache",
};

export default async function handler(req, res) {

    const { path } = req.query;

    /* Require a path parameter */
    if (!path) {
        return res.status(400).json({ error: "Missing 'path' query parameter" });
    }

    /* Only allow /event/… paths to limit exposure */
    if (!path.startsWith(ALLOWED_PREFIX)) {
        return res.status(403).json({ error: "Path not allowed" });
    }

    const upstream = `${SOFASCORE_BASE}${path}`;

    try {
        const upstream_res = await fetch(upstream, {
            headers: PROXY_HEADERS,
        });

        const body = await upstream_res.text();

        res.status(upstream_res.status);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.send(body);

    } catch (err) {
        console.error("[sofascore proxy] fetch error:", err);
        res.status(502).json({ error: "Proxy fetch failed", detail: err.message });
    }
}
