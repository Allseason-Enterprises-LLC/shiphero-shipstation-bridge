# ShipHero → ShipStation Label Bridge

Automated shipping label generation bridge for Clean Nutra. When USPS/carrier accounts are frozen in ShipHero, this service generates labels via ShipStation and syncs tracking back to ShipHero.

## Architecture

```
ShipHero (frozen USPS) 
  ↓ (ready-to-ship orders)
Bridge Service
  ↓ (order details)
ShipStation (active carriers: USPS, UPS, FedEx, DHL)
  ↓ (label + tracking)
ShipHero
  ↓ (warehouse prints label)
Warehouse ships package
```

## Deployment

### 1. Create Vercel Project

```bash
vercel link
```

### 2. Set Environment Variables

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SHIPSTATION_API_KEY
vercel env add SHIPHERO_WAREHOUSE_ID
vercel env add SHIPHERO_CUSTOMER_ACCOUNT_ID
vercel env add CRON_SECRET
vercel env add SHIP_FROM_NAME
vercel env add SHIP_FROM_ADDRESS1
vercel env add SHIP_FROM_CITY
vercel env add SHIP_FROM_STATE
vercel env add SHIP_FROM_ZIP
vercel env add SHIP_FROM_COUNTRY
vercel env add SHIP_FROM_PHONE
```

### 3. Create Supabase Table

Run this SQL in your Supabase database:

```sql
create table bridge_orders (
  id uuid primary key default gen_random_uuid(),
  shiphero_order_id text not null unique,
  shiphero_order_number text not null,
  shipstation_label_id text,
  tracking_number text,
  label_url text,
  status text not null default 'pending' check (status in ('pending', 'generating', 'success', 'failed')),
  error text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index bridge_orders_status on bridge_orders(status);
create index bridge_orders_order_id on bridge_orders(shiphero_order_id);
```

### 4. Deploy

```bash
vercel deploy --prod
```

## API Endpoints

All endpoints require `Authorization: Bearer <CRON_SECRET>` header.

### GET /api/orders/pending

Fetch ready-to-ship orders from ShipHero and record them in the bridge DB.

**Response:**
```json
{
  "total_ready": 10,
  "new_recorded": 3,
  "pending_total": 5
}
```

### POST /api/labels/generate

Generate a label for a single order in the bridge DB.

**Body:**
```json
{
  "shiphero_order_id": "uuid"
}
```

**Response:**
```json
{
  "order_number": "134092",
  "tracking_number": "9400111899223456789012",
  "carrier": "usps",
  "service": "usps_ground_advantage",
  "cost": 8.50,
  "label_url": "https://..."
}
```

### POST /api/sync/run

Process all pending orders: generate labels and sync tracking to ShipHero.

**Response:**
```json
{
  "processed": 5,
  "successful": 5,
  "failed": 0,
  "results": [
    {
      "order_number": "134092",
      "tracking_number": "9400111899223456789012",
      "status": "success"
    }
  ]
}
```

## Cron Jobs (Vercel)

Set up cron jobs in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/orders/pending",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/sync/run",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

This syncs pending orders every hour and processes them every 15 minutes.

## Testing Locally

```bash
npm install
npm run dev
```

Then test endpoints:

```bash
curl -X POST http://localhost:3000/api/sync/run \
  -H "Authorization: Bearer test-secret" \
  -H "Content-Type: application/json"
```

## Features

- ✅ Automatic label generation via ShipStation
- ✅ Rate shopping (selects cheapest carrier/service)
- ✅ Tracking synced back to ShipHero
- ✅ Idempotent (won't generate duplicate labels)
- ✅ Error tracking and retry capability
- ✅ Supabase persistence
- ✅ Vercel serverless deployment
- ✅ Support for: USPS, UPS, FedEx, DHL, GlobalPost, SEKO LTL

## Troubleshooting

### ShipHero JWT token expired
The token is fetched from Supabase warehouse table. If it expires (28 days), update it:

```sql
update warehouses 
set jwt_token = 'new_token_here'
where id = '22e17170-af72-4bf8-b77c-d73c86b06765';
```

### Orders not syncing
1. Check Vercel logs: `vercel logs`
2. Check bridge DB status: orders should be `pending` → `generating` → `success`
3. Verify ShipStation API key is valid
4. Check ShipHero has orders ready to ship

### Labels not printing
Labels are created in ShipHero as shipments. Warehouse team should see them in the ShipHero UI under Shipments tab.

## Author

Jarvis - ShipHero Bridge automation for Clean Nutra
