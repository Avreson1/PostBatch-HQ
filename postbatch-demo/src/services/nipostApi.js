/**
 * NIPOST Digital Postcode Staging API Integration Service
 * ========================================================
 *
 * Official API Documentation: https://docs.postcode.gov.ng
 * Developer Dashboard: https://dashboard.postcode.gov.ng
 *
 * Implements:
 *   1. Live fetch to NIPOST staging endpoint (default: https://api.postcode.gov.ng/v1/lookup)
 *   2. Publishable Key authorization header (X-API-Key and Bearer)
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

// Configuration from environment variables (.env)
export const NIPOST_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NIPOST_API_URL) ||
  'https://api.postcode.gov.ng/v1/lookup';

export const NIPOST_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NIPOST_API_KEY) ||
  'pb_live_nipost_staging_7f8a92b1';

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

/**
 * Perform a real fetch request to NIPOST staging API
 * Endpoint: https://api.postcode.gov.ng/v1/lookup
 * Headers: X-API-Key and Authorization: Bearer
 */
export async function fetchLiveNipostLookup(postcode, timeoutMs = 4500) {
  const clean = postcode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const formatted = formatPostcode(clean);

  const url = new URL(NIPOST_API_URL);
  url.searchParams.set('code', formatted);
  url.searchParams.set('postcode', clean);
  url.searchParams.set('level', '3');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': NIPOST_API_KEY,
        Authorization: `Bearer ${NIPOST_API_KEY}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NIPOST HTTP error ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();
    return payload;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Reverse geocode GPS coordinates via NIPOST live API
 */
export async function fetchLiveGpsLookup(lat, lng, timeoutMs = 4500) {
  const url = new URL(NIPOST_API_URL);
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lng', lng.toString());
  url.searchParams.set('level', '3');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': NIPOST_API_KEY,
        Authorization: `Bearer ${NIPOST_API_KEY}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NIPOST GPS lookup HTTP error ${response.status}`);
    }

    const payload = await response.json();
    return payload;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
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
 * Unified Postcode Verification Function
 *
 * If isLiveMode is true:
 *   - Attempts real fetch to NIPOST staging API with publishable key headers
 *   - If network or staging server drops, gracefully catches the error and
 *     falls back to local seed database so the pitch never breaks.
 *
 * If isLiveMode is false:
 *   - Uses local seed database directly.
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

  const options = {
    inputCode: code,
    streetAddress,
    customerName,
    phone,
  };

  if (isLiveMode) {
    try {
      const apiResponse = await fetchLiveNipostLookup(code);
      const parsedOrder = parseNipostPayloadToOrder(apiResponse, {
        ...options,
        apiSource: 'live_nipost_staging',
      });

      return {
        success: true,
        payload: parsedOrder,
        isLive: true,
        fallbackTriggered: false,
        source: 'Live NIPOST Staging API',
      };
    } catch (err) {
      console.warn(
        `[PostBatch] Live NIPOST staging API request failed (${err.message}). Gracefully falling back to local seed data for pitch presentation.`
      );

      const fallbackOrder = lookupPostcodeOffline(code, options);
      if (fallbackOrder) {
        return {
          success: true,
          payload: fallbackOrder,
          isLive: false,
          fallbackTriggered: true,
          fallbackReason: err.message,
          source: 'Offline Fallback (Staging dropped)',
        };
      }
      return {
        success: false,
        error: `Live API request failed (${err.message}) and no offline fallback available.`,
      };
    }
  }

  // Offline Fallback Mode
  const fallbackOrder = lookupPostcodeOffline(code, options);
  if (fallbackOrder) {
    return {
      success: true,
      payload: fallbackOrder,
      isLive: false,
      fallbackTriggered: false,
      source: 'Offline Fallback (Local Seeds)',
    };
  }

  return { success: false, error: 'Could not resolve postcode offline' };
}

/**
 * Unified GPS Postcode Detection
 */
export async function detectPostcodeViaGPS({
  lat,
  lng,
  isLiveMode = true,
  streetAddress = '',
}) {
  const options = { streetAddress };

  if (isLiveMode) {
    try {
      const apiResponse = await fetchLiveGpsLookup(lat, lng);
      const parsedOrder = parseNipostPayloadToOrder(apiResponse, {
        ...options,
        apiSource: 'live_nipost_staging',
      });

      return {
        success: true,
        payload: parsedOrder,
        isLive: true,
        fallbackTriggered: false,
        source: 'Live NIPOST Staging GPS',
      };
    } catch (err) {
      console.warn(
        `[PostBatch] Live GPS reverse lookup failed (${err.message}). Using local coordinate resolution.`
      );
    }
  }

  // Offline resolution for GPS
  // Default to Abuja Municipal Wuse Zone 4 (or Lagos if lat ~ 6.5)
  const isLagos = lat < 7.0;
  const fallbackCode = isLagos ? 'LA-101-2001' : 'FC-02-A09-DB-09';
  const fallbackAddr = isLagos
    ? 'Ebute Metta, Lagos Mainland, Lagos'
    : '12 Marina Road, Wuse Zone 4, Abuja';

  const fallbackOrder = lookupPostcodeOffline(fallbackCode, {
    ...options,
    streetAddress: streetAddress || fallbackAddr,
  });

  return {
    success: true,
    payload: fallbackOrder,
    isLive: false,
    fallbackTriggered: isLiveMode,
    fallbackReason: isLiveMode ? 'Staging GPS lookup unreachable' : undefined,
    source: isLiveMode ? 'Offline Fallback (GPS dropped)' : 'Offline Local GPS',
  };
}
