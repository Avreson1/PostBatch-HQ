/**
 * NIPOST Digital Postcode Staging API Integration Service
 * ========================================================
 *
 * Official API Documentation: https://docs.postcode.gov.ng
 * Developer Dashboard: https://dashboard.postcode.gov.ng
 *
 * Implements:
 *   1. Live calls to the official NIPOST API through the Vite dev proxy
 *      (/nipost → api.postcode.gov.ng; X-API-Key added server-side)
 *   2. /v1/lookup (graded L1–L5), /v1/search/reverse, /v1/reference/*
 *   3. Dynamic payload parser mapping state, lga, district, area, coordinates,
 *      and GeoJSON geometry polygon into the PostBatchOrder schema.
 *   4. Graceful offline fallback to local seed orders and mock postcodes when
 *      offline mode is active or when the staging server is unreachable.
 */

import {
  parse5SegmentPostcode,
  formatPostcode,
  resolvePostcodeNames,
  calculateShippingFee,
  resolveCoordinates,
  DEFAULT_ORIGIN_HUB,
  PRESET_POSTCODES,
  NIPOST_LOOKUP,
} from 'postbatch-widget';
import mockPostcodesData from '../../mock/postcodes.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// The browser never sees the API key. In dev, Vite proxies /nipost/* to
// https://api.postcode.gov.ng and attaches X-API-Key server-side
// (see vite.config.js). Set NIPOST_API_KEY in the repo-root .env.
// Values injected by vite.config.js `define` (safe facts only, never the key).
/* global __NIPOST_KEY_CONFIGURED__, __NIPOST_KEY_KIND__, __NIPOST_LOOKUP_LEVEL__ */
const injected = (name, fallback) => {
  try {
    return name === 'configured'
      ? __NIPOST_KEY_CONFIGURED__
      : name === 'kind'
      ? __NIPOST_KEY_KIND__
      : __NIPOST_LOOKUP_LEVEL__;
  } catch {
    return fallback; // running outside Vite (e.g. node test scripts)
  }
};

/** Public API host (for display only). */
export const NIPOST_API_URL = 'https://api.postcode.gov.ng';

/** Same-origin path the browser calls; the dev proxy forwards it. */
const NIPOST_PROXY_BASE = '/nipost/v1';

/** Max lookup level your key is granted (L1 is free: validity only). */
export const NIPOST_LOOKUP_LEVEL = Number(injected('level', 1)) || 1;

/** Whether a key is configured, and which kind (no secret exposed). */
export const NIPOST_KEY_CONFIGURED = Boolean(injected('configured', false));
export const NIPOST_KEY_KIND = injected('kind', '') || '';
export const NIPOST_IS_TEST_KEY = NIPOST_KEY_KIND.includes('test');

/** @deprecated kept for older imports; the key now lives server-side only. */
export const NIPOST_API_KEY = '';

/**
 * Generate a GeoJSON bounding-box polygon around coordinates
 * if the live API response does not include an explicit geometry polygon.
 */
export function generateBoundingPolygon(lat, lng, formattedCode, districtName) {
  const deltaLat = 0.004;
  const deltaLng = 0.005;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [Number((lng - deltaLng).toFixed(6)), Number((lat - deltaLat).toFixed(6))],
          [Number((lng + deltaLng).toFixed(6)), Number((lat - deltaLat).toFixed(6))],
          [Number((lng + deltaLng).toFixed(6)), Number((lat + deltaLat).toFixed(6))],
          [Number((lng - deltaLng).toFixed(6)), Number((lat + deltaLat).toFixed(6))],
          [Number((lng - deltaLng).toFixed(6)), Number((lat - deltaLat).toFixed(6))],
        ],
      ],
    },
    properties: {
      postcode: formattedCode,
      district: districtName,
      zone: formattedCode ? formattedCode.slice(0, 10) : 'ZONE',
    },
  };
}

/**
 * Parse an API response or mock object into the standard PostBatchOrder schema.
 * Conforms strictly to AI-CONTEXT.md and requirement 2.
 */
export function parseNipostPayloadToOrder(apiData, options = {}) {
  const {
    inputCode = '',
    streetAddress = '',
    customerName = 'Amina Bello',
    phone = '08031234567',
    item = 'Sneakers (Size 42)',
    price = 28000,
    apiSource = 'live_nipost_staging',
  } = options;

  // Resolve nested structures (handles data, result, or direct object)
  const data = apiData?.data || apiData?.result || apiData || {};

  // Extract raw or formatted postcode string
  const rawPostcodeStr =
    data.postcode ||
    data.code ||
    data.formatted ||
    data.digital_postcode ||
    inputCode ||
    'FC-02-A09-DB-09';

  const clean = rawPostcodeStr.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const formatted =
    data.formatted ||
    formatPostcode(clean) ||
    'FC-02-A09-DB-09';

  // Extract 5 segments
  const parsedSegments = parse5SegmentPostcode(formatted) || {
    state: clean.slice(0, 2) || 'FC',
    lga: clean.slice(2, 4) || '02',
    district: clean.slice(4, 7) || 'A09',
    area: clean.slice(7, 9) || 'DB',
    unit: clean.slice(9, 11) || '09',
    clean,
    formatted,
  };

  const stateCode = data.state_code || data.segments?.state || parsedSegments.state || 'FC';
  const lgaCode = data.lga_code || data.segments?.lga || parsedSegments.lga || '02';
  const districtCode = data.district_code || data.segments?.district || parsedSegments.district || 'A09';
  const areaCode = data.area_code || data.segments?.area || parsedSegments.area || 'DB';
  const unitCode = data.unit_code || data.segments?.unit || parsedSegments.unit || '09';

  const segments = {
    state: stateCode,
    lga: lgaCode,
    district: districtCode,
    area: areaCode,
    unit: unitCode,
    clean,
    formatted,
  };

  // Resolve official administrative names
  const localResolvedNames = resolvePostcodeNames(segments) || {};
  const adminAddr = data.administrative_address || {};

  const stateName =
    adminAddr.state_name ||
    data.state_name ||
    data.state ||
    localResolvedNames.state ||
    'Federal Capital Territory';

  const lgaName =
    adminAddr.lga_name ||
    data.lga_name ||
    data.lga ||
    localResolvedNames.lga ||
    'Abuja Municipal';

  const districtName =
    adminAddr.district_name ||
    adminAddr.locality_name ||
    data.district_name ||
    data.district ||
    localResolvedNames.district ||
    'Wuse';

  const areaName =
    adminAddr.area_name ||
    data.area_name ||
    data.area ||
    localResolvedNames.area ||
    'Zone 4';

  const names = {
    state: stateName,
    lga: lgaName,
    district: districtName,
    area: areaName,
  };

  // Resolve spatial coordinates (lat, lng)
  let lat =
    data.coordinates?.lat ??
    data.latitude ??
    data.lat ??
    (data.geometry?.type === 'Point' ? data.geometry.coordinates[1] : null);

  let lng =
    data.coordinates?.lng ??
    data.longitude ??
    data.lng ??
    (data.geometry?.type === 'Point' ? data.geometry.coordinates[0] : null);

  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    const fallbackCoords = resolveCoordinates(segments);
    lat = fallbackCoords.lat;
    lng = fallbackCoords.lng;
  }

  const coordinates = {
    lat: Number(Number(lat).toFixed(6)),
    lng: Number(Number(lng).toFixed(6)),
  };

  // Resolve geometry polygon (Requirement 2: mapping geometry polygon)
  let polygon = null;
  if (data.polygon && (data.polygon.type === 'Feature' || data.polygon.type === 'Polygon')) {
    polygon = data.polygon;
  } else if (data.geometry && data.geometry.type === 'Polygon') {
    polygon = {
      type: 'Feature',
      geometry: data.geometry,
      properties: { postcode: formatted, district: districtName },
    };
  } else {
    // Check if mock database has matching polygon for this postcode or prefix
    const mockMatch = mockPostcodesData.postcodes?.find(
      (p) =>
        p.postcode === formatted ||
        p.postcode === rawPostcodeStr ||
        p.postcode?.replace(/-/g, '') === clean
    );
    if (mockMatch?.polygon) {
      polygon = mockMatch.polygon;
    } else {
      polygon = generateBoundingPolygon(coordinates.lat, coordinates.lng, formatted, districtName);
    }
  }

  // Calculate dynamic zone-based delivery fee
  const shipping = calculateShippingFee(segments, DEFAULT_ORIGIN_HUB);

  // Resolve address text
  const address =
    streetAddress.trim() ||
    data.recent_house_address?.recent ||
    data.address ||
    data.formatted_address ||
    `${names.area}, ${names.district}, ${names.lga}, ${names.state}`;

  // Build canonical PostBatchOrder object
  const order = {
    orderId: options.orderId || `ORD-${Math.floor(1085 + Math.random() * 8900)}`,
    customerName: customerName.trim(),
    phone: phone.trim(),
    item,
    price,
    shippingFee: shipping.fee,
    shippingLabel: shipping.label,
    zoneType: shipping.zoneType,
    postcode: clean,
    formatted,
    segments,
    names,
    address,
    coordinates,
    polygon,
    confidence: 0.99,
    verified: true,
    apiSource,
  };

  return order;
}

// ---------------------------------------------------------------------------
// Live NIPOST API calls (official endpoints: docs.postcode.gov.ng)
// ---------------------------------------------------------------------------

export class NipostApiError extends Error {
  constructor(message, { status = 0, code = 'network_error' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function nipostGet(path, params = {}, timeoutMs = 4500) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${NIPOST_PROXY_BASE}${path}${qs ? `?${qs}` : ''}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON (e.g. proxy missing) */
    }
    if (!res.ok) {
      throw new NipostApiError(body?.error?.message || `NIPOST HTTP ${res.status}`, {
        status: res.status,
        code: body?.error?.code || `http_${res.status}`,
      });
    }
    if (!body) throw new NipostApiError('NIPOST returned no JSON (is the dev proxy running?)', { code: 'bad_response' });
    return body;
  } catch (err) {
    if (err instanceof NipostApiError) throw err;
    throw new NipostApiError(err.name === 'AbortError' ? 'NIPOST request timed out' : err.message, {
      code: err.name === 'AbortError' ? 'timeout' : 'network_error',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /v1/lookup — graded postcode lookup.
 * L1 returns { postcode, valid, status, verified }; L2+ adds administrative_address etc.
 */
export async function fetchLiveNipostLookup(postcode, level = NIPOST_LOOKUP_LEVEL) {
  const clean = postcode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return nipostGet('/lookup', { code: formatPostcode(clean), level });
}

/**
 * GET /v1/search/reverse — nearest active unit to a coordinate (max 250 m).
 * Returns { found, postcode?, radius_m, ... }.
 */
export async function fetchLiveGpsLookup(lat, lng, maxDistanceM = 250) {
  return nipostGet('/search/reverse', { lat, lng, max_distance_m: maxDistanceM });
}

// Reference catalogue (free, no credits): states → LGAs → districts → areas.
const refCache = new Map();
async function cachedRef(key, path, params) {
  if (!refCache.has(key)) {
    refCache.set(
      key,
      nipostGet(path, params).catch((err) => {
        refCache.delete(key);
        throw err;
      })
    );
  }
  return refCache.get(key);
}

/**
 * Check each segment of a postcode against NIPOST's official reference
 * catalogue. Works on every key (free), so a test key can still prove the
 * state / LGA / district / area exist even when the building unit is not
 * in its dataset.
 */
export async function checkHierarchyLive(segments) {
  const { state, lga, district, area } = segments || {};
  const [states, lgas, districts, areas] = await Promise.all([
    cachedRef('states', '/reference/states', {}),
    state ? cachedRef(`lgas:${state}`, '/reference/lgas', { state }) : null,
    state && lga ? cachedRef(`districts:${state}:${lga}`, '/reference/districts', { state, lga }) : null,
    state && lga && district
      ? cachedRef(`areas:${state}:${lga}:${district}`, '/reference/areas', { state, lga, district })
      : null,
  ]);
  const stateRow = states?.data?.states?.find((s) => s.code === state);
  const lgaRow = lgas?.data?.lgas?.find((l) => l.code === lga);
  return {
    state: Boolean(stateRow),
    lga: Boolean(lgaRow),
    district: Boolean(districts?.data?.districts?.some((d) => d.code === district)),
    area: Boolean(areas?.data?.areas?.some((a) => a.code === area)),
    names: { state: stateRow?.name || null, lga: lgaRow?.name || null },
  };
}

/**
 * Offline lookup fallback using local seed orders and mock postcodes database
 */
export function lookupPostcodeOffline(postcode, options = {}) {
  const clean = (postcode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const formatted = formatPostcode(clean);

  // 1. Try matching in mock postcodes.json
  const matchInMock = mockPostcodesData.postcodes?.find(
    (p) =>
      p.postcode === formatted ||
      p.postcode === postcode ||
      p.postcode?.replace(/-/g, '') === clean
  );

  if (matchInMock) {
    const segments = parse5SegmentPostcode(formatted) || {
      state: matchInMock.postcode.slice(0, 2),
      lga: matchInMock.postcode.slice(3, 5) || '01',
      district: matchInMock.postcode.slice(3, 6) || '101',
      area: '01',
      unit: '01',
      clean,
      formatted,
    };

    return parseNipostPayloadToOrder(
      {
        postcode: matchInMock.postcode,
        formatted: matchInMock.postcode,
        state: matchInMock.state,
        lga: matchInMock.lga,
        area: matchInMock.area,
        district: matchInMock.area,
        latitude: matchInMock.lat,
        longitude: matchInMock.lng,
        polygon: matchInMock.polygon,
      },
      {
        ...options,
        inputCode: matchInMock.postcode,
        apiSource: 'offline_fallback',
      }
    );
  }

  // 2. Try matching in PRESET_POSTCODES
  const presetMatch = PRESET_POSTCODES.find(
    (p) => p.postcode === clean || p.formatted === formatted
  );

  if (presetMatch) {
    return parseNipostPayloadToOrder(
      {
        postcode: presetMatch.postcode,
        formatted: presetMatch.formatted,
        segments: presetMatch.segments,
        names: presetMatch.names,
        coordinates: presetMatch.coordinates,
        address: presetMatch.address,
      },
      {
        ...options,
        inputCode: presetMatch.formatted,
        streetAddress: options.streetAddress || presetMatch.address,
        apiSource: 'offline_fallback',
      }
    );
  }

  // 3. Fallback: Parse 5-segment pattern using administrative lookup tables
  const parsed = parse5SegmentPostcode(formatted);
  if (parsed) {
    return parseNipostPayloadToOrder(
      {
        postcode: parsed.clean,
        formatted: parsed.formatted,
        segments: parsed,
      },
      {
        ...options,
        inputCode: formatted,
        apiSource: 'offline_fallback',
      }
    );
  }

  return null;
}

/**
 * Unified postcode verification
 * ==============================
 *
 * Live mode asks the official NIPOST API two things in parallel:
 *   1. /v1/lookup  — is this exact building postcode in the registry?
 *   2. /v1/reference/* — do its state, LGA, district and area exist?
 *
 * The result always carries a `nipost` object describing what NIPOST
 * actually confirmed, so the UI can say so honestly:
 *   status: 'verified'        → NIPOST confirmed the full postcode
 *           'not_in_registry' → reachable, but this unit isn't in the key's dataset
 *           'unavailable'     → API unreachable / key problem → offline data
 *           'offline'         → Test mode, API not called
 *
 * Address details (coordinates, names for routing) come from PostBatch's
 * local data, because L1 keys return validity only.
 */
export async function verifyPostcode({
  code,
  isLiveMode = true,
  streetAddress = '',
  customerName = 'Amina Bello',
  phone = '08031234567',
}) {
  const clean = (code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length < 5) {
    return { success: false, error: 'Postcode is incomplete' };
  }

  const options = { inputCode: code, streetAddress, customerName, phone };
  const local = lookupPostcodeOffline(code, options);

  if (!isLiveMode) {
    return local
      ? {
          success: true,
          payload: local,
          isLive: false,
          fallbackTriggered: false,
          source: 'Test mode (local data)',
          nipost: { status: 'offline' },
        }
      : { success: false, error: 'Could not resolve postcode offline' };
  }

  const segments = parse5SegmentPostcode(formatPostcode(clean));
  const [lookupRes, hierarchyRes] = await Promise.allSettled([
    fetchLiveNipostLookup(code),
    segments ? checkHierarchyLive(segments) : Promise.reject(new Error('Malformed postcode')),
  ]);

  // API unreachable or key rejected → offline data, say why
  if (lookupRes.status === 'rejected') {
    const err = lookupRes.reason;
    console.warn(`[PostBatch] NIPOST lookup failed (${err.code || ''} ${err.message}). Using local data.`);
    return local
      ? {
          success: true,
          payload: { ...local, apiSource: 'offline_fallback' },
          isLive: false,
          fallbackTriggered: true,
          fallbackReason: err.message,
          source: 'NIPOST unavailable · local data',
          nipost: {
            status: 'unavailable',
            errorCode: err.code,
            error: err.message,
            hierarchy: hierarchyRes.status === 'fulfilled' ? hierarchyRes.value : null,
          },
        }
      : { success: false, error: `NIPOST unavailable (${err.message}) and no local data for this code.` };
  }

  const data = lookupRes.value?.data || {};
  const hierarchy = hierarchyRes.status === 'fulfilled' ? hierarchyRes.value : null;
  const verified = data.valid === true;

  // Build the order from local data, then overlay what NIPOST returned
  const base =
    local ||
    parseNipostPayloadToOrder({ postcode: data.postcode || code }, { ...options, apiSource: 'live_nipost' });
  const admin = data.administrative_address || {};
  const payload = {
    ...base,
    names: {
      ...base.names,
      state: admin.state_name || hierarchy?.names?.state || base.names?.state,
      lga: admin.lga_name || hierarchy?.names?.lga || base.names?.lga,
    },
    address: streetAddress || data.recent_house_address?.recent || base.address,
    verified,
    apiSource: verified ? 'live_nipost' : 'live_nipost_unit_not_found',
  };

  return {
    success: true,
    payload,
    isLive: true,
    fallbackTriggered: !verified,
    source: verified ? 'Verified by NIPOST' : 'NIPOST: unit not in registry',
    nipost: {
      status: verified ? 'verified' : 'not_in_registry',
      apiStatus: data.status || null,
      level: NIPOST_LOOKUP_LEVEL,
      hierarchy,
    },
  };
}

/**
 * GPS → postcode: NIPOST reverse geocode first, then verify the result.
 * If no NIPOST unit is within 250 m (or the API is down), falls back to the
 * nearest PostBatch demo postcode and says so.
 */
export async function detectPostcodeViaGPS({ lat, lng, isLiveMode = true, streetAddress = '' }) {
  const isLagos = lat < 7.0;
  const fallbackCode = isLagos ? 'LA-101-2001' : 'FC-02-A09-DB-09';
  const fallbackAddr = isLagos ? 'Ebute Metta, Lagos Mainland, Lagos' : '12 Marina Road, Wuse Zone 4, Abuja';

  if (isLiveMode) {
    try {
      const rev = await fetchLiveGpsLookup(lat, lng);
      const found = rev?.data?.found && (rev.data.postcode || rev.data.unit?.postcode);
      if (found) {
        const result = await verifyPostcode({ code: found, isLiveMode: true, streetAddress });
        return { ...result, source: `NIPOST reverse geocode · ${result.source}` };
      }
      // Reachable, but nothing within range for this key
      const result = await verifyPostcode({
        code: fallbackCode,
        isLiveMode: true,
        streetAddress: streetAddress || fallbackAddr,
      });
      return {
        ...result,
        fallbackTriggered: true,
        fallbackReason: `No NIPOST unit within ${rev?.data?.radius_m ?? 250} m`,
        nipost: { ...result.nipost, reverse: 'no_unit_nearby' },
      };
    } catch (err) {
      console.warn(`[PostBatch] NIPOST reverse geocode failed (${err.message}). Using local data.`);
    }
  }

  const local = lookupPostcodeOffline(fallbackCode, { streetAddress: streetAddress || fallbackAddr });
  return {
    success: true,
    payload: local,
    isLive: false,
    fallbackTriggered: isLiveMode,
    fallbackReason: isLiveMode ? 'NIPOST reverse geocode unreachable' : undefined,
    source: isLiveMode ? 'NIPOST unavailable · local data' : 'Test mode (local data)',
    nipost: { status: isLiveMode ? 'unavailable' : 'offline' },
  };
}
