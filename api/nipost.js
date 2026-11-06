/**
 * Vercel serverless proxy for the NIPOST Postcode API
 * ===================================================
 *
 * Production twin of the Vite dev proxy in postbatch-demo/vite.config.js.
 * The browser calls /nipost/v1/... (rewritten here by vercel.json); this
 * function adds X-API-Key from the NIPOST_API_KEY environment variable and
 * forwards to https://api.postcode.gov.ng. The key never reaches the browser.
 *
 * Only the read-only endpoints the app uses are allowed, so this can't be
 * used as an open proxy for anything else on the API.
 */

const API_BASE = (process.env.NIPOST_API_BASE || 'https://api.postcode.gov.ng').replace(/\/+$/, '');

const ALLOWED = /^v1\/(lookup|search\/(reverse|autocomplete|nearby)|reference\/(states|lgas|districts|areas)|assembly\/(assemble|disassemble))$/;

// Reference data barely changes: let Vercel's edge cache it for a day.
const CACHEABLE = /^v1\/reference\//;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'Only GET is supported' } });
  }

  const key = process.env.NIPOST_API_KEY || process.env.VITE_NIPOST_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: { code: 'key_not_configured', message: 'Set NIPOST_API_KEY in Vercel → Project → Settings → Environment Variables' },
    });
  }

  // vercel.json rewrites /nipost/:path* → /api/nipost?path=:path*, keeping the original query string
  const { path = '', ...query } = req.query || {};
  const apiPath = (Array.isArray(path) ? path.join('/') : String(path)).replace(/^\/+/, '');
  if (!ALLOWED.test(apiPath)) {
    return res.status(404).json({ error: { code: 'not_found', message: `Endpoint not allowed: /${apiPath}` } });
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    for (const value of Array.isArray(v) ? v : [v]) params.append(k, value);
  }
  const url = `${API_BASE}/${apiPath}${params.toString() ? `?${params}` : ''}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(url, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    if (upstream.ok && CACHEABLE.test(apiPath)) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    return res.send(body);
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: { code: timedOut ? 'upstream_timeout' : 'upstream_unreachable', message: 'Could not reach the NIPOST API' },
    });
  }
};
