// test-api.mjs - Verify NIPOST API integration, header passing, parsing, and fallback logic

import {
  parseNipostPayloadToOrder,
  generateBoundingPolygon,
  lookupPostcodeOffline,
} from './src/services/nipostApi.js';

console.log('--- TEST 1: Schema parsing with mock NIPOST L3 API payload ---');
const sampleNipostApiResponse = {
  status: 'success',
  data: {
    postcode: 'FC-02-A09-DB-09',
    valid: true,
    administrative_address: {
      state_name: 'Federal Capital Territory',
      lga_name: 'Abuja Municipal',
      district_name: 'Wuse',
      area_name: 'Zone 4',
      zone: 'NORTH CENTRAL',
    },
    recent_house_address: {
      recent: '12 Marina Road, Wuse Zone 4, Abuja',
    },
    latitude: 9.0622,
    longitude: 7.4721,
    polygon: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7.468, 9.058],
            [7.476, 9.058],
            [7.476, 9.066],
            [7.468, 9.066],
            [7.468, 9.058],
          ],
        ],
      },
      properties: { postcode: 'FC-02-A09-DB-09', district: 'Wuse' },
    },
  },
};

const parsedOrder = parseNipostPayloadToOrder(sampleNipostApiResponse, {
  streetAddress: '12 Marina Road, Wuse Zone 4, Abuja',
  customerName: 'Amina Bello',
  phone: '08031234567',
});

console.log('Parsed Order ID:', parsedOrder.orderId);
console.log('Customer:', parsedOrder.customerName, '| Phone:', parsedOrder.phone);
console.log('Postcode Clean:', parsedOrder.postcode, '| Formatted:', parsedOrder.formatted);
console.log('Segments:', JSON.stringify(parsedOrder.segments));
console.log('Names:', JSON.stringify(parsedOrder.names));
console.log('Coordinates:', parsedOrder.coordinates);
console.log('Shipping Fee:', parsedOrder.shippingFee, `(${parsedOrder.shippingLabel})`);
console.log('Polygon type:', parsedOrder.polygon?.type, '| coordinates count:', parsedOrder.polygon?.geometry?.coordinates?.[0]?.length);

if (
  parsedOrder.postcode === 'FC02A09DB09' &&
  parsedOrder.formatted === 'FC-02-A09-DB-09' &&
  parsedOrder.segments.state === 'FC' &&
  parsedOrder.segments.lga === '02' &&
  parsedOrder.segments.district === 'A09' &&
  parsedOrder.segments.area === 'DB' &&
  parsedOrder.names.state === 'Federal Capital Territory' &&
  parsedOrder.names.lga === 'Abuja Municipal' &&
  parsedOrder.names.district === 'Wuse' &&
  parsedOrder.names.area === 'Zone 4' &&
  parsedOrder.polygon &&
  parsedOrder.coordinates.lat === 9.0622 &&
  parsedOrder.coordinates.lng === 7.4721
) {
  console.log('✓ TEST 1 PASSED: Successfully mapped API payload to PostBatchOrder schema!');
} else {
  console.error('✗ TEST 1 FAILED');
  process.exit(1);
}

console.log('\n--- TEST 2: Offline fallback parsing (Lagos & Kano codes) ---');
const lagosOrder = lookupPostcodeOffline('LA-101-2001');
console.log('Lagos Order:', lagosOrder.formatted, '| State:', lagosOrder.names.state, '| Area:', lagosOrder.names.area);
console.log('Lagos Polygon:', !!lagosOrder.polygon);

const kanoOrder = lookupPostcodeOffline('KN-100-5001');
console.log('Kano Order:', kanoOrder.formatted, '| State:', kanoOrder.names.state, '| Area:', kanoOrder.names.area);
console.log('Kano Polygon:', !!kanoOrder.polygon);

if (lagosOrder.names.state === 'Lagos' && kanoOrder.names.state === 'Kano' && lagosOrder.polygon && kanoOrder.polygon) {
  console.log('✓ TEST 2 PASSED: Offline fallback seamlessly resolves mock postcodes and polygons!');
} else {
  console.error('✗ TEST 2 FAILED');
  process.exit(1);
}

console.log('\n--- TEST 3: Bounding Polygon Generation ---');
const poly = generateBoundingPolygon(9.0622, 7.4721, 'FC-02-A09-DB-09', 'Wuse');
console.log('Generated Polygon:', JSON.stringify(poly.geometry));
if (poly.geometry.coordinates[0].length === 5) {
  console.log('✓ TEST 3 PASSED: Valid closed GeoJSON polygon generated!');
} else {
  console.error('✗ TEST 3 FAILED');
  process.exit(1);
}

console.log('\nAll tests passed successfully!');
