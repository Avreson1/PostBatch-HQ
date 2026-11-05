# PostBatch: System Specification & Shared Context

## Product Definition
PostBatch is a B2B dispatch orchestration engine and checkout SDK built on Nigeria's National Digital Postcode API (docs.postcode.gov.ng). It solves the "last 100 meters" logistics bottleneck for Nigerian e-commerce.

We do NOT build a consumer app. We build two B2B components demonstrated in a unified sandbox:
1. **Merchant Checkout Integration**: Uses the NIPOST Web Widget and Publishable Key to capture standardized 5-segment postcodes at checkout.
2. **Fleet Hub Prefix-Clustering Engine**: Ingests incoming orders and groups them by NIPOST alphanumeric segments into optimized rider batches, eliminating hours of manual morning parcel sorting.

## Official NIPOST Postcode Hierarchy (5 Segments)
Nigeria's 11-character code is formatted as `AA-99-H77-BB-55`:
- `segments.state` (2 Alpha): State (e.g., "LA" = Lagos, "FC" = Abuja)
- `segments.lga` (2 Numeric): Local Government Area
- `segments.district` (3 Alphanumeric): Postal District (Rider Zone)
- `segments.area` (2 Alpha): Neighborhood / Street Cluster
- `segments.unit` (2 Numeric): Specific Building / Compound

## Standard Payload Shape (Captured at Checkout)
Every order stored in the system conforms to this structure:
```json
{
  "orderId": "ORD-1082",
  "customerName": "Amina Bello",
  "phone": "08031234567",
  "item": "Sneakers (Size 42)",
  "price": 28000,
  "shippingFee": 1500,
  "postcode": "FC02A09DB09",
  "formatted": "FC-02-A09-DB-09",
  "segments": {
    "state": "FC",
    "lga": "02",
    "district": "A09",
    "area": "DB",
    "unit": "09"
  },
  "names": {
    "state": "Federal Capital Territory",
    "lga": "Abuja Municipal",
    "district": "Wuse",
    "area": "Zone 4"
  },
  "address": "12 Marina Road, Wuse, Abuja",
  "coordinates": {
    "lat": 9.0622,
    "lng": 7.4721
  }
}