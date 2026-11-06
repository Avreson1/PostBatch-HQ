/**
 * Road routing with three modes
 * =============================
 *
 *   shortest  Fewest kilometres. Valhalla motor_scooter with `shortest: true`
 *             and OSRM's alternatives are both asked; the shorter wins per leg.
 *   fastest   Least riding time. OSRM's fastest route (prefers major roads).
 *   balanced  Time and distance weighed together. Valhalla motor_scooter's
 *             default costing, tuned for small delivery bikes.
 *
 * Exports:
 *   - fetchRoadDistanceFn(points, mode) → distanceKm(a, b) from a distance table
 *   - fetchRoadPath(points, mode)       → road geometry visiting points in order
 *   - ROUTE_MODES                       → labels for the UI
 *
 * Every call has a timeout. If a router is down the other one is used, and
 * if both fail callers fall back to straight-line estimates.
 */

import { roadDistanceKm } from 'postbatch-engine';

export const ROUTE_MODES = [
  { id: 'shortest', label: 'Shortest', hint: 'Fewest kilometres' },
  { id: 'fastest', label: 'Fastest', hint: 'Least time, major roads' },
  { id: 'balanced', label: 'Balanced', hint: 'Time and distance together' },
];

/** The mode drawn as a muted comparison line next to each mode. */
export const COMPARE_MODE = { shortest: 'fastest', fastest: 'shortest', balanced: 'shortest' };

const OSRM_URL = 'https://router.project-osrm.org';
const VALHALLA_URL = 'https://valhalla1.openstreetmap.de';
const TIMEOUT_MS = 6000;
const VALHALLA_MAX_CELLS = 100; // public server limit per matrix request

const valhallaCosting = (shortest) => ({
  costing: 'motor_scooter',
  costing_options: { motor_scooter: shortest ? { shortest: true } : {} },
  units: 'kilometers',
});

const key = (c) => `${Number(c.lat).toFixed(6)},${Number(c.lng).toFixed(6)}`;
const toLngLat = (c) => `${Number(c.lng).toFixed(6)},${Number(c.lat).toFixed(6)}`;
const toValhalla = (c) => ({ lat: Number(c.lat), lon: Number(c.lng) });

async function request(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Valhalla's public server can be slow or rate-limited: give up quickly and,
// after a failure, skip it for a minute instead of waiting on every request.
const VALHALLA_TIMEOUT_MS = 3500;
const VALHALLA_COOLDOWN_MS = 60_000;
let valhallaDownUntil = 0;

async function valhalla(endpoint, body, shortest) {
  if (Date.now() < valhallaDownUntil) throw new Error('Valhalla cooling down');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VALHALLA_TIMEOUT_MS);
  try {
    const res = await fetch(`${VALHALLA_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...valhallaCosting(shortest) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Valhalla HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    valhallaDownUntil = Date.now() + VALHALLA_COOLDOWN_MS;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Decode a Valhalla polyline (precision 6) into [[lat, lng], ...]. */
function decodePolyline6(str) {
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lat / 1e6, lng / 1e6]);
  }
  return coords;
}

// ---------------------------------------------------------------------------
// Distance tables
// ---------------------------------------------------------------------------

async function osrmMatrix(pts) {
  const data = await request(`${OSRM_URL}/table/v1/driving/${pts.map(toLngLat).join(';')}?annotations=distance`);
  if (data.code !== 'Ok') throw new Error(`OSRM ${data.code}`);
  return data.distances.map((row) => row.map((m) => (typeof m === 'number' ? m / 1000 : null)));
}

async function valhallaMatrix(pts, shortest) {
  const locs = pts.map(toValhalla);
  const rowsPerChunk = Math.max(1, Math.floor(VALHALLA_MAX_CELLS / locs.length));
  const chunks = [];
  for (let start = 0; start < locs.length; start += rowsPerChunk) chunks.push(locs.slice(start, start + rowsPerChunk));
  const results = await Promise.all(
    chunks.map((sources) => valhalla('sources_to_targets', { sources, targets: locs }, shortest))
  );
  return results.flatMap((data) =>
    data.sources_to_targets.map((row) => row.map((cell) => (typeof cell?.distance === 'number' ? cell.distance : null)))
  );
}

const MATRIX_SOURCES = {
  shortest: [osrmMatrix, (p) => valhallaMatrix(p, true)], // min of both
  fastest: [osrmMatrix],
  balanced: [(p) => valhallaMatrix(p, false)],
};
const MATRIX_FALLBACK = { fastest: [(p) => valhallaMatrix(p, false)], balanced: [osrmMatrix], shortest: [] };

const matrixCache = new Map();

/**
 * Road distance between every pair of points for the given mode.
 * Resolves to { distanceKm, source: 'road' | 'estimate', mode }.
 */
export async function fetchRoadDistanceFn(points, mode = 'shortest') {
  const unique = [];
  const index = new Map();
  for (const p of points) {
    if (!p || isNaN(Number(p.lat))) continue;
    const k = key(p);
    if (!index.has(k)) {
      index.set(k, unique.length);
      unique.push(p);
    }
  }
  if (unique.length < 2) return { distanceKm: roadDistanceKm, source: 'estimate', mode };

  const cacheKey = `${mode}:${unique.map(key).sort().join('|')}`;
  if (matrixCache.has(cacheKey)) return matrixCache.get(cacheKey);

  const settle = async (fns) =>
    (await Promise.allSettled(fns.map((fn) => fn(unique)))).filter((r) => r.status === 'fulfilled').map((r) => r.value);
  let matrices = await settle(MATRIX_SOURCES[mode] || MATRIX_SOURCES.shortest);
  if (!matrices.length) matrices = await settle(MATRIX_FALLBACK[mode] || []);
  if (!matrices.length) {
    console.warn('[routing] Road routers unavailable, using straight-line estimates');
    return { distanceKm: roadDistanceKm, source: 'estimate', mode };
  }

  const n = unique.length;
  const best = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const vals = matrices.map((m) => m[i]?.[j]).filter((x) => typeof x === 'number');
      return vals.length ? Math.min(...vals) : null;
    })
  );
  const distanceKm = (a, b) => {
    const i = index.get(key(a));
    const j = index.get(key(b));
    const d = i !== undefined && j !== undefined ? best[i][j] : null;
    return typeof d === 'number' ? d : roadDistanceKm(a, b);
  };
  const result = { distanceKm, source: 'road', mode };
  matrixCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Route geometry
// ---------------------------------------------------------------------------

async function osrmRoutes(pts) {
  const alt = pts.length === 2 ? '&alternatives=3' : ''; // alternatives only for 2-point requests
  const data = await request(
    `${OSRM_URL}/route/v1/driving/${pts.map(toLngLat).join(';')}?overview=full&geometries=geojson${alt}`
  );
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`OSRM ${data.code}`);
  return data.routes.map((r) => ({
    coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    km: r.distance / 1000,
    minutes: r.duration / 60,
    router: 'osrm',
  }));
}

async function valhallaRoute(pts, shortest) {
  const data = await valhalla('route', { locations: pts.map(toValhalla) }, shortest);
  const legs = data.trip?.legs;
  if (!legs?.length) throw new Error('Valhalla: no route');
  const coords = legs.flatMap((leg, i) => {
    const c = decodePolyline6(leg.shape);
    return i === 0 ? c : c.slice(1);
  });
  return { coords, km: data.trip.summary.length, minutes: data.trip.summary.time / 60, router: 'valhalla' };
}

/** Best OSRM alternative for each leg (by km or by minutes), joined into one route. */
// Balanced score: 1 km ≈ 2 min of riding in town, so time and distance count equally.
const balancedScore = (r) => r.minutes + r.km * 2;

async function osrmBestPerLeg(pts, by = 'km') {
  const score = typeof by === 'function' ? by : (r) => r[by];
  const legs = await Promise.all(
    pts.slice(0, -1).map((p, i) =>
      osrmRoutes([p, pts[i + 1]]).then((routes) => routes.reduce((a, b) => (score(b) < score(a) ? b : a)))
    )
  );
  return {
    coords: legs.flatMap((leg, i) => (i === 0 ? leg.coords : leg.coords.slice(1))),
    km: legs.reduce((s, l) => s + l.km, 0),
    minutes: legs.reduce((s, l) => s + l.minutes, 0),
    router: 'osrm',
  };
}

const pathCache = new Map();

async function computePath(valid, mode) {
  const [osrm, valShort, valBal] = await Promise.allSettled([
    mode === 'balanced' ? Promise.reject(new Error('skip')) : osrmRoutes(valid),
    mode === 'shortest' ? valhallaRoute(valid, true) : Promise.reject(new Error('skip')),
    mode === 'balanced' ? valhallaRoute(valid, false) : Promise.reject(new Error('skip')),
  ]);
  const ok = (r) => (r.status === 'fulfilled' ? r.value : null);

  if (mode === 'fastest') {
    // Whole-route answer plus per-leg alternatives; least minutes wins
    const perLegFast = valid.length > 2 ? await osrmBestPerLeg(valid, 'minutes').catch(() => null) : null;
    const candidates = [...(ok(osrm) || []), perLegFast].filter(Boolean);
    if (candidates.length) return candidates.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    return valhallaRoute(valid, false).catch(() => null);
  }
  if (mode === 'balanced') {
    // Valhalla's scooter costing when available; otherwise weigh time and km per leg
    const [whole, perLegBal] = await Promise.all([
      osrmRoutes(valid).catch(() => null),
      valid.length > 2 ? osrmBestPerLeg(valid, balancedScore).catch(() => null) : null,
    ]);
    const candidates = [ok(valBal), ...(whole || []), perLegBal].filter(Boolean);
    return candidates.length ? candidates.reduce((a, b) => (balancedScore(b) < balancedScore(a) ? b : a)) : null;
  }
  // shortest: every candidate from both routers, fewest km wins. For multi-stop
  // routes OSRM only returns alternatives per leg, so legs are routed one by one.
  const perLeg = valid.length > 2 ? await osrmBestPerLeg(valid, 'km').catch(() => null) : null;
  const candidates = [...(ok(osrm) || []), ok(valShort), perLeg].filter(Boolean);
  return candidates.length ? candidates.reduce((a, b) => (b.km < a.km ? b : a)) : null;
}

/**
 * Road geometry visiting `points` in order, for the given mode.
 * Resolves to { coords: [[lat,lng],...], km, minutes, router, mode, source: 'road' } or null.
 */
export async function fetchRoadPath(points, mode = 'shortest') {
  const valid = points.filter((p) => p && !isNaN(Number(p.lat)));
  if (valid.length < 2) return null;
  const cacheKey = `${mode}:${valid.map(key).join('|')}`;
  if (pathCache.has(cacheKey)) return pathCache.get(cacheKey);

  const path = await computePath(valid, mode).catch(() => null);
  if (!path) {
    console.warn('[routing] Road routers unavailable, drawing straight lines');
    return null;
  }
  const result = { ...path, mode, source: 'road' };
  pathCache.set(cacheKey, result);
  return result;
}
