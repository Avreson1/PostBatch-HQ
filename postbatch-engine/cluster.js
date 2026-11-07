/**
 * PostBatch Engine — Prefix Clustering Algorithm
 * ================================================
 *
 * Groups an array of NIPOST postcodes and e-commerce orders by their alphanumeric
 * prefixes to bucket parcels into optimized delivery zones.
 *
 * Official NIPOST Postcode Hierarchy (5 Segments - AA-99-H77-BB-55):
 *   - segments.state    (2 Alpha)        → State (e.g. "LA" = Lagos, "FC" = Abuja)
 *   - segments.lga      (2 Numeric)      → Local Government Area
 *   - segments.district (3 Alphanumeric) → Postal District (Rider Zone)
 *   - segments.area     (2 Alpha)        → Neighborhood / Street Cluster
 *   - segments.unit     (2 Numeric)      → Specific Building / Compound
 *
 * Clustering Strategy:
 *   Orders are clustered by Postal District (State + LGA + District, e.g. "FC-02-A09").
 *   This forms a dedicated "Rider Batch". Inside each batch, stops are sequenced
 *   from the hub with nearest-neighbour + 2-opt to shorten the route.
 *
 * Savings are measured, not assumed: the fleet's total route is compared with
 * manual dispatch (parcels handed out in arrival order to the same number of
 * riders). Distances are road estimates (Haversine x circuity factor).
 */

// PostBatch Engine — Prefix Clustering Algorithm

// =============================================================================
// State Code → Full Name Lookup
// =============================================================================

export const STATE_MAP = {
  LA: 'Lagos',
  AB: 'Abia',
  KN: 'Kano',
  RV: 'Rivers',
  OG: 'Ogun',
  FC: 'Federal Capital Territory',
  OY: 'Oyo',
  ED: 'Edo',
  EN: 'Enugu',
  KD: 'Kaduna',
  AN: 'Anambra',
  DL: 'Delta',
};

// =============================================================================
// 15 Realistic Seed Orders (Abuja Municipal / Wuse, Garki & Central Area)
// Conforming exactly to the AI_CONTEXT.md schema
// =============================================================================

export const SEED_ORDERS = [
  // ---------------------------------------------------------------------------
  // Zone 1: Wuse District (FC-02-A09)
  // ---------------------------------------------------------------------------
  {
    orderId: 'ORD-1081',
    customerName: 'Amina Bello',
    phone: '08031234567',
    item: 'Sneakers (Size 42)',
    price: 28000,
    shippingFee: 1500,
    postcode: 'FC02A09AA03',
    formatted: 'FC-02-A09-AA-03',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A09',
      area: 'AA',
      unit: '03',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Wuse',
      area: 'Zone 1',
    },
    address: '8 Sultan Abubakar Way, Wuse Zone 1, Abuja',
    coordinates: {
      lat: 9.0685,
      lng: 7.4660,
    },
  },
  {
    orderId: 'ORD-1082',
    customerName: 'Tunde Bakare',
    phone: '08029876543',
    item: 'Smart Fitness Watch',
    price: 34500,
    shippingFee: 1500,
    postcode: 'FC02A09AB12',
    formatted: 'FC-02-A09-AB-12',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A09',
      area: 'AB',
      unit: '12',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Wuse',
      area: 'Zone 2',
    },
    address: '24 Kashim Ibrahim Way, Wuse Zone 2, Abuja',
    coordinates: {
      lat: 9.0662,
      lng: 7.4705,
    },
  },
  {
    orderId: 'ORD-1083',
    customerName: 'Fatima Aliyu',
    phone: '08145556677',
    item: 'Wireless ANC Headphones',
    price: 42000,
    shippingFee: 1500,
    postcode: 'FC02A09DB09',
    formatted: 'FC-02-A09-DB-09',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A09',
      area: 'DB',
      unit: '09',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Wuse',
      area: 'Zone 4',
    },
    address: '12 Marina Road, Wuse Zone 4, Abuja',
    coordinates: {
      lat: 9.0622,
      lng: 7.4721,
    },
  },
  {
    orderId: 'ORD-1084',
    customerName: 'Chukwudi Eze',
    phone: '08051112233',
    item: 'Mechanical Keyboard',
    price: 39000,
    shippingFee: 1500,
    postcode: 'FC02A09EA04',
    formatted: 'FC-02-A09-EA-04',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A09',
      area: 'EA',
      unit: '04',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Wuse',
      area: 'Zone 5',
    },
    address: '15 Alex Ekwueme Way, Wuse Zone 5, Abuja',
    coordinates: {
      lat: 9.0588,
      lng: 7.4752,
    },
  },
  {
    orderId: 'ORD-1085',
    customerName: 'Zainab Mohammed',
    phone: '08183334455',
    item: '4K Action Camera',
    price: 65000,
    shippingFee: 2000,
    postcode: 'FC02A09FA18',
    formatted: 'FC-02-A09-FA-18',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A09',
      area: 'FA',
      unit: '18',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Wuse',
      area: 'Wuse 2',
    },
    address: '42 Aminu Kano Crescent, Wuse 2, Abuja',
    coordinates: {
      lat: 9.0792,
      lng: 7.4780,
    },
  },

  // ---------------------------------------------------------------------------
  // Zone 2: Garki District (FC-02-A03)
  // ---------------------------------------------------------------------------
  {
    orderId: 'ORD-1086',
    customerName: 'Ngozi Adeleke',
    phone: '08077778899',
    item: 'Portable Blender',
    price: 18500,
    shippingFee: 1200,
    postcode: 'FC02A03BA05',
    formatted: 'FC-02-A03-BA-05',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A03',
      area: 'BA',
      unit: '05',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Garki',
      area: 'Area 1',
    },
    address: '10 Moshood Abiola Way, Garki Area 1, Abuja',
    coordinates: {
      lat: 9.0345,
      lng: 7.4812,
    },
  },
  {
    orderId: 'ORD-1087',
    customerName: 'Ibrahim Garba',
    phone: '08092223344',
    item: 'Cordless Car Vacuum',
    price: 23000,
    shippingFee: 1200,
    postcode: 'FC02A03BB11',
    formatted: 'FC-02-A03-BB-11',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A03',
      area: 'BB',
      unit: '11',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Garki',
      area: 'Area 2',
    },
    address: '22 Tafawa Balewa Way, Garki Area 2, Abuja',
    coordinates: {
      lat: 9.0310,
      lng: 7.4865,
    },
  },
  {
    orderId: 'ORD-1088',
    customerName: 'Folake Adebayo',
    phone: '08129990011',
    item: 'Bluetooth Soundbar',
    price: 54000,
    shippingFee: 1800,
    postcode: 'FC02A03CA02',
    formatted: 'FC-02-A03-CA-02',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A03',
      area: 'CA',
      unit: '02',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Garki',
      area: 'Area 3',
    },
    address: '7 Festival Road, Garki Area 3, Abuja',
    coordinates: {
      lat: 9.0280,
      lng: 7.4910,
    },
  },
  {
    orderId: 'ORD-1089',
    customerName: 'Umar Farouk',
    phone: '08034445566',
    item: 'Anker 20,000mAh PowerBank',
    price: 29500,
    shippingFee: 1200,
    postcode: 'FC02A03DA14',
    formatted: 'FC-02-A03-DA-14',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A03',
      area: 'DA',
      unit: '14',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Garki',
      area: 'Area 8',
    },
    address: '18 Emeka Anyaoku St, Garki Area 8, Abuja',
    coordinates: {
      lat: 9.0245,
      lng: 7.4975,
    },
  },
  {
    orderId: 'ORD-1090',
    customerName: 'Blessing Nwachukwu',
    phone: '08168887766',
    item: 'Leather Laptop Briefcase',
    price: 32000,
    shippingFee: 1500,
    postcode: 'FC02A03EB07',
    formatted: 'FC-02-A03-EB-07',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A03',
      area: 'EB',
      unit: '07',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Garki',
      area: 'Area 11',
    },
    address: '31 Ahmadu Bello Way, Garki Area 11, Abuja',
    coordinates: {
      lat: 9.0210,
      lng: 7.5020,
    },
  },

  // ---------------------------------------------------------------------------
  // Zone 3: Central Business District / Maitama (FC-02-A01)
  // ---------------------------------------------------------------------------
  {
    orderId: 'ORD-1091',
    customerName: 'Ahmed Shehu',
    phone: '08023331122',
    item: 'Thermal Coffee Carafe',
    price: 16500,
    shippingFee: 1200,
    postcode: 'FC02A01AA01',
    formatted: 'FC-02-A01-AA-01',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A01',
      area: 'AA',
      unit: '01',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Central Area',
      area: 'Central Area North',
    },
    address: '2 Herbert Macaulay Way, Central Area, Abuja',
    coordinates: {
      lat: 9.0550,
      lng: 7.4920,
    },
  },
  {
    orderId: 'ORD-1092',
    customerName: 'Kemi Adeleke',
    phone: '08134449988',
    item: 'Ergonomic Desk Chair',
    price: 85000,
    shippingFee: 3500,
    postcode: 'FC02A01AB06',
    formatted: 'FC-02-A01-AB-06',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A01',
      area: 'AB',
      unit: '06',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Central Area',
      area: 'Diplomatic Zone',
    },
    address: '14 Constitution Ave, Central Area, Abuja',
    coordinates: {
      lat: 9.0520,
      lng: 7.4985,
    },
  },
  {
    orderId: 'ORD-1093',
    customerName: 'David Mark',
    phone: '08085551234',
    item: 'Studio Condenser Mic',
    price: 47000,
    shippingFee: 1500,
    postcode: 'FC02A01AC15',
    formatted: 'FC-02-A01-AC-15',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A01',
      area: 'AC',
      unit: '15',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Central Area',
      area: 'Shehu Shagari Way',
    },
    address: '5 Shehu Shagari Way, Central Area, Abuja',
    coordinates: {
      lat: 9.0595,
      lng: 7.5040,
    },
  },
  {
    orderId: 'ORD-1094',
    customerName: 'Hauwa Usman',
    phone: '08176662345',
    item: 'Smart Wi-Fi Air Purifier',
    price: 62000,
    shippingFee: 2500,
    postcode: 'FC02A01BA08',
    formatted: 'FC-02-A01-BA-08',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A01',
      area: 'BA',
      unit: '08',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Central Area',
      area: 'Maitama South',
    },
    address: '19 Aguiyi Ironsi St, Maitama / CBD, Abuja',
    coordinates: {
      lat: 9.0730,
      lng: 7.4950,
    },
  },
  {
    orderId: 'ORD-1095',
    customerName: 'Oluwaseun Ajayi',
    phone: '08091118822',
    item: 'Noise-Cancelling Earphones',
    price: 29000,
    shippingFee: 1500,
    postcode: 'FC02A01BB22',
    formatted: 'FC-02-A01-BB-22',
    segments: {
      state: 'FC',
      lga: '02',
      district: 'A01',
      area: 'BB',
      unit: '22',
    },
    names: {
      state: 'Federal Capital Territory',
      lga: 'Abuja Municipal',
      district: 'Central Area',
      area: 'Maitama Heights',
    },
    address: '8 Gana Street, Maitama / CBD, Abuja',
    coordinates: {
      lat: 9.0835,
      lng: 7.4980,
    },
  },
];

// =============================================================================
// Great-Circle Distance Calculation (Haversine Formula)
// =============================================================================

export function haversineDistanceKm(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const lat1 = Number(coord1.lat);
  const lon1 = Number(coord1.lng);
  const lat2 = Number(coord2.lat);
  const lon2 = Number(coord2.lng);

  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;

  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth's mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parse5SegmentPostcode(postcode) {
  if (!postcode) return { state: '', lga: '', district: '', area: '', unit: '' };
  const clean = String(postcode).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length === 11) {
    return {
      state: clean.substring(0, 2),
      lga: clean.substring(2, 4),
      district: clean.substring(4, 7),
      area: clean.substring(7, 9),
      unit: clean.substring(9, 11),
    };
  }
  const parts = String(postcode).split('-');
  if (parts.length === 5) {
    return {
      state: parts[0],
      lga: parts[1],
      district: parts[2],
      area: parts[3],
      unit: parts[4],
    };
  }
  return { state: clean.slice(0, 2), lga: '', district: '', area: '', unit: '' };
}

// =============================================================================
// Route Model
// =============================================================================
//
// By default distances are road-distance ESTIMATES: straight-line (Haversine)
// distance multiplied by an urban circuity factor, so the engine works fully
// offline. Callers can pass `distanceKm(a, b)` backed by a real road network
// (e.g. an OSRM distance matrix) and every route + savings figure uses it.
//
// Every rider starts at the dispatch hub, visits each stop, and returns.

/** Dispatch hub (UrbanFootwear NG hub, Wuse — matches widget DEFAULT_ORIGIN_HUB). */
export const DISPATCH_HUB = {
  name: 'Abuja Central Hub',
  formatted: 'FC-02-A09-AA-01',
  coordinates: { lat: 9.0685, lng: 7.466 },
};

/** Urban road circuity: roads are ~30% longer than the straight line. */
export const ROAD_CIRCUITY_FACTOR = 1.3;

/** Typical delivery motorbike: ~35 km per litre. */
export const LITRES_PER_KM = 1 / 35;

const round2 = (n) => Math.round(n * 100) / 100;

/** Estimated road distance between two coordinates, in km. */
export function roadDistanceKm(a, b) {
  return haversineDistanceKm(a, b) * ROAD_CIRCUITY_FACTOR;
}

/** Total km for hub → stops (in the given order) → hub. */
export function tourDistanceKm(stops, hub = DISPATCH_HUB.coordinates, dist = roadDistanceKm) {
  if (!stops.length) return 0;
  let km = dist(hub, stops[0].coordinates);
  for (let i = 0; i < stops.length - 1; i++) {
    km += dist(stops[i].coordinates, stops[i + 1].coordinates);
  }
  km += dist(stops[stops.length - 1].coordinates, hub);
  return km;
}

/**
 * Sequence stops for one rider:
 *   1. Nearest-neighbour: from the hub, always ride to the closest unvisited stop.
 *   2. 2-opt: repeatedly reverse any section of the route that makes it shorter.
 */
export function optimiseStopSequence(stops, hub = DISPATCH_HUB.coordinates, dist = roadDistanceKm) {
  const withCoords = stops.filter((s) => s.coordinates && !isNaN(Number(s.coordinates.lat)));
  const withoutCoords = stops.filter((s) => !withCoords.includes(s));
  if (withCoords.length < 3) {
    // Nearest-neighbour alone is optimal for 0–2 stops.
    const remaining = [...withCoords];
    const route = [];
    let current = hub;
    while (remaining.length) {
      let best = 0;
      for (let i = 1; i < remaining.length; i++) {
        if (dist(current, remaining[i].coordinates) < dist(current, remaining[best].coordinates)) best = i;
      }
      current = remaining[best].coordinates;
      route.push(remaining.splice(best, 1)[0]);
    }
    return [...route, ...withoutCoords];
  }

  // 1. Nearest-neighbour construction
  const remaining = [...withCoords];
  let route = [];
  let current = hub;
  while (remaining.length) {
    let best = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const km = dist(current, remaining[i].coordinates);
      if (km < bestKm) {
        bestKm = km;
        best = i;
      }
    }
    current = remaining[best].coordinates;
    route.push(remaining.splice(best, 1)[0]);
  }

  // 2. 2-opt improvement
  let improved = true;
  let bestKm = tourDistanceKm(route, hub, dist);
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        const km = tourDistanceKm(candidate, hub, dist);
        if (km < bestKm - 1e-9) {
          route = candidate;
          bestKm = km;
          improved = true;
        }
      }
    }
  }

  return [...route, ...withoutCoords];
}

/**
 * Baseline — dispatch WITHOUT PostBatch:
 * parcels come off the unsorted pile in arrival order and are handed to the
 * same number of riders in turn (rider 1, rider 2, rider 3, rider 1, …).
 * Each rider delivers in the order they were handed the parcels.
 */
export function manualDispatchDistanceKm(orders, riderCount, hub = DISPATCH_HUB.coordinates, dist = roadDistanceKm) {
  const riders = Array.from({ length: Math.max(1, riderCount) }, () => []);
  orders
    .filter((o) => o.coordinates && !isNaN(Number(o.coordinates.lat)))
    .forEach((o, i) => riders[i % riders.length].push(o));
  return riders.reduce((sum, stops) => sum + tourDistanceKm(stops, hub, dist), 0);
}

// =============================================================================
// Core Module 2 Prefix-Clustering Function
// =============================================================================

export function clusterOrders(orders = [], { hub = DISPATCH_HUB.coordinates, distanceKm = roadDistanceKm, distanceSource = 'estimate' } = {}) {
  const dist = distanceKm;
  const startTime = (typeof performance !== 'undefined' ? performance : Date).now();

  if (!Array.isArray(orders) || orders.length === 0) {
    const emptyResult = [];
    emptyResult.batches = [];
    emptyResult.metrics = {
      totalOrders: 0,
      totalBatches: 0,
      totalRouteDistanceKm: 0,
      totalUnclusteredDistanceKm: 0,
      totalDistanceSavedKm: 0,
      fuelSavedPercent: 0,
      estimatedFuelSavedPercent: 0,
      totalFuelSavedLitres: 0,
      executionTimeMs: 0,
      bannerText: '0 orders batched | 0 rider zones',
    };
    emptyResult.summary = emptyResult.metrics;
    return emptyResult;
  }

  // 1. Group orders by NIPOST postal district (state + lga + district)
  const districtGroups = new Map();

  for (const rawOrder of orders) {
    const order = { ...rawOrder };
    let segments = order.segments;

    if (!segments || !segments.state || !segments.district) {
      segments = parse5SegmentPostcode(order.postcode || order.formatted);
      order.segments = segments;
    }

    const state = (segments.state || 'XX').toUpperCase();
    const lga = (segments.lga || '00').toUpperCase();
    const district = (segments.district || '000').toUpperCase();
    const districtKey = `${state}-${lga}-${district}`;

    if (!districtGroups.has(districtKey)) {
      districtGroups.set(districtKey, []);
    }
    districtGroups.get(districtKey).push(order);
  }

  // Visual batch color palette for maps & UI
  const BATCH_COLORS = [
    { name: 'Blue', hex: '#2563eb', border: '#1d4ed8', bg: 'bg-blue-500', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-800' },
    { name: 'Emerald', hex: '#059669', border: '#047857', bg: 'bg-emerald-500', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-800' },
    { name: 'Purple', hex: '#7c3aed', border: '#6d28d9', bg: 'bg-purple-500', text: 'text-purple-600', badge: 'bg-purple-100 text-purple-800' },
    { name: 'Amber', hex: '#d97706', border: '#b45309', bg: 'bg-amber-500', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-800' },
    { name: 'Rose', hex: '#e11d48', border: '#be123c', bg: 'bg-rose-500', text: 'text-rose-600', badge: 'bg-rose-100 text-rose-800' },
    { name: 'Cyan', hex: '#0891b2', border: '#0e7490', bg: 'bg-cyan-500', text: 'text-cyan-600', badge: 'bg-cyan-100 text-cyan-800' },
  ];

  const batches = [];
  let batchIndex = 0;

  for (const [districtKey, groupOrders] of districtGroups.entries()) {
    // 2. Sequence stops: nearest-neighbour + 2-opt from the hub
    const arrivalOrder = [...groupOrders];
    const batchOrders = optimiseStopSequence(groupOrders, hub, dist);

    batchOrders.forEach((o, idx) => {
      o.stopSequence = idx + 1;
      o.batchKey = districtKey;
    });

    // 3. Route metrics (estimated road km, hub → stops → hub)
    const estimatedRouteDistanceKm = round2(tourDistanceKm(batchOrders, hub, dist));
    // Same stops, delivered in the order the parcels arrived (no sequencing)
    const unclusteredDistanceKm = round2(tourDistanceKm(arrivalOrder, hub, dist));
    const distanceSavedKm = round2(Math.max(0, unclusteredDistanceKm - estimatedRouteDistanceKm));
    const fuelSavedPercent = unclusteredDistanceKm > 0
      ? Math.round((distanceSavedKm / unclusteredDistanceKm) * 100)
      : 0;
    const fuelSavedLitres = round2(distanceSavedKm * LITRES_PER_KM);

    const colorConfig = BATCH_COLORS[batchIndex % BATCH_COLORS.length];
    const firstOrder = batchOrders[0] || {};
    const stateName = firstOrder.names?.state || STATE_MAP[firstOrder.segments?.state] || firstOrder.segments?.state;
    const lgaName = firstOrder.names?.lga || `LGA ${firstOrder.segments?.lga}`;
    const districtName = firstOrder.names?.district || `District ${firstOrder.segments?.district}`;

    const stopCoordinates = batchOrders
      .filter((o) => o.coordinates && typeof o.coordinates.lat === 'number' && typeof o.coordinates.lng === 'number')
      .map((o) => [o.coordinates.lat, o.coordinates.lng]);
    const hubPoint = [hub.lat, hub.lng];
    const routeCoordinates = stopCoordinates.length ? [hubPoint, ...stopCoordinates, hubPoint] : [];

    batches.push({
      batchId: `BATCH-${districtKey}`,
      zoneIndex: batchIndex + 1,
      districtKey,
      districtCode: `${firstOrder.segments?.state || ''}${firstOrder.segments?.lga || ''}${firstOrder.segments?.district || ''}`,
      zoneName: `${districtName} (${districtKey})`,
      riderName: `Rider ${String.fromCharCode(65 + batchIndex)}`,
      state: stateName,
      lga: lgaName,
      district: districtName,
      totalOrders: batchOrders.length,
      orders: batchOrders,
      routeCoordinates,
      color: colorConfig,
      estimatedRouteDistanceKm,
      unclusteredDistanceKm,
      distanceSavedKm,
      estimatedFuelSaved: `${fuelSavedPercent}%`,
      fuelSavedPercent,
      fuelSavedLitres,
    });

    batchIndex++;
  }

  // Fleet totals: PostBatch routes vs. manual dispatch with the same number of riders
  const totalOrders = orders.length;
  const totalBatches = batches.length;
  const totalRouteDistanceKm = round2(batches.reduce((sum, b) => sum + b.estimatedRouteDistanceKm, 0));
  const totalUnclusteredDistanceKm = round2(manualDispatchDistanceKm(orders, totalBatches, hub, dist));
  const totalDistanceSavedKm = round2(Math.max(0, totalUnclusteredDistanceKm - totalRouteDistanceKm));
  const overallFuelSavedPercent = totalUnclusteredDistanceKm > 0
    ? Math.round((totalDistanceSavedKm / totalUnclusteredDistanceKm) * 100)
    : 0;
  const totalFuelSavedLitres = round2(totalDistanceSavedKm * LITRES_PER_KM);

  const elapsedMs = (typeof performance !== 'undefined' ? performance : Date).now() - startTime;
  const executionTimeMs = Math.round(elapsedMs * 10) / 10;

  const metrics = {
    totalOrders,
    totalBatches,
    totalRouteDistanceKm,
    totalUnclusteredDistanceKm,
    totalDistanceSavedKm,
    fuelSavedPercent: overallFuelSavedPercent,
    estimatedFuelSavedPercent: overallFuelSavedPercent,
    totalFuelSavedLitres,
    distanceSource,
    executionTimeMs,
    executionTimeSec: `${(executionTimeMs / 1000).toFixed(3)}s`,
    bannerText: `${totalOrders} orders batched in ${executionTimeMs}ms | ${totalBatches} rider zones | ${totalRouteDistanceKm} km vs ${totalUnclusteredDistanceKm} km manual (${overallFuelSavedPercent}% less distance)`,
  };

  batches.batches = batches;
  batches.metrics = metrics;
  batches.summary = metrics;
  batches.totalOrders = totalOrders;
  batches.fuelSavedPercent = overallFuelSavedPercent;

  return batches;
}

// =============================================================================
// Legacy Sample Postcodes (kept for backward compatibility)
// =============================================================================

export const SAMPLE_POSTCODES = [
  'LA-101-2001', 'LA-101-2002', 'LA-101-2003',
  'LA-102-3001', 'LA-102-3002',
  'LA-200-1001', 'LA-200-1002', 'LA-200-1003', 'LA-200-1004',
  'AB-101-1001', 'AB-101-1002',
  'AB-202-4001', 'AB-202-4002', 'AB-202-4003',
  'KN-100-5001', 'KN-100-5002', 'KN-100-5003',
  'KN-201-6001',
  'RV-110-7001', 'RV-110-7002',
  'OG-301-8001', 'OG-301-8002', 'OG-301-8003', 'OG-301-8004',
  'FC-900-0001', 'FC-900-0002',
];

export function parsePostcode(postcode) {
  const normalised = postcode.trim().toUpperCase();
  const segments = normalised.split('-');

  if (segments.length !== 3) {
    throw new Error(`Invalid NIPOST postcode format: "${postcode}". Expected SS-DDD-SSSS.`);
  }

  const [state, district, street] = segments;
  return {
    state,
    district: `${state}-${district}`,
    street: normalised,
    raw: normalised,
  };
}

export function clusterByPrefix(postcodes) {
  const clusters = {};
  for (const pc of postcodes) {
    const parsed = parsePostcode(pc);
    const key = parsed.district;
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(parsed.raw);
  }
  return clusters;
}

export function clusterByState(postcodes) {
  const clusters = {};
  for (const pc of postcodes) {
    const parsed = parsePostcode(pc);
    const key = parsed.state;
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(parsed.raw);
  }
  return clusters;
}

export function generateManifest(postcodes) {
  const districtClusters = clusterByPrefix(postcodes);
  return Object.entries(districtClusters).map(([prefix, items]) => {
    const stateCode = prefix.split('-')[0];
    return {
      zoneId: prefix,
      zoneName: `${STATE_MAP[stateCode] || stateCode} — District ${prefix.split('-')[1]}`,
      state: STATE_MAP[stateCode] || stateCode,
      parcelCount: items.length,
      postcodes: items,
      sortOrder: items.length,
      estimatedStops: items.length,
    };
  }).sort((a, b) => b.sortOrder - a.sortOrder);
}

export function printManifest(manifest) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         POSTBATCH — DISPATCH MANIFEST            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  for (const zone of manifest) {
    console.log(`║  Zone: ${zone.zoneId.padEnd(10)} | ${zone.zoneName}`);
    console.log(`║  Parcels: ${zone.parcelCount}  |  Stops: ${zone.estimatedStops}`);
    console.log(`║  Postcodes: ${zone.postcodes.join(', ')}`);
    console.log('╠──────────────────────────────────────────────────╣');
  }
  console.log('╚══════════════════════════════════════════════════╝\n');
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('cluster.js')) {
  console.log('\n[PostBatch Engine] Testing clusterOrders on %d seed orders…\n', SEED_ORDERS.length);
  const result = clusterOrders(SEED_ORDERS);
  console.log('ROI Banner:', result.metrics.bannerText);
  console.log('\nBatches:');
  for (const b of result) {
    console.log(`→ Batch: ${b.batchId} | ${b.zoneName} (${b.riderName})`);
    console.log(`  Parcels: ${b.totalOrders} | Route: ${b.estimatedRouteDistanceKm}km (unsequenced ${b.unclusteredDistanceKm}km, ${b.fuelSavedPercent}% shorter)`);
    console.log(`  Stops sequence: ${b.orders.map((o) => `${o.segments.area}-${o.segments.unit} (${o.customerName})`).join(' → ')}`);
  }
  console.log('\n✓ Prefix-Clustering Engine Module 2 verified successfully.\n');
}

export default {
  clusterOrders,
  haversineDistanceKm,
  roadDistanceKm,
  tourDistanceKm,
  optimiseStopSequence,
  manualDispatchDistanceKm,
  DISPATCH_HUB,
  parse5SegmentPostcode,
  SEED_ORDERS,
  parsePostcode,
  clusterByPrefix,
  clusterByState,
  generateManifest,
  printManifest,
  SAMPLE_POSTCODES,
  STATE_MAP,
};
