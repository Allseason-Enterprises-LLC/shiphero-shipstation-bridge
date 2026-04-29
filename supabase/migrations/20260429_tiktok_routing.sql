-- TikTok Order Routing Tables
-- Created: 2026-04-29
-- Purpose: Store SKU routing rules and audit log for TikTok → ShipHero warehouse routing

-- Routing Rules: which SKU patterns go to which warehouse
CREATE TABLE IF NOT EXISTS tiktok_routing_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku_pattern TEXT NOT NULL UNIQUE,
  warehouse TEXT NOT NULL DEFAULT 'las_vegas',  -- 'las_vegas' or 'clearship'
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Routing Log: audit trail of all routing decisions
CREATE TABLE IF NOT EXISTS tiktok_routing_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_number TEXT,
  skus TEXT[] DEFAULT '{}',
  target_warehouse TEXT NOT NULL,
  reason TEXT,
  matched_pattern TEXT,
  routed_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_routing_log_routed_at ON tiktok_routing_log(routed_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_log_warehouse ON tiktok_routing_log(target_warehouse);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON tiktok_routing_rules(active) WHERE active = true;

-- Seed initial routing rules (Las Vegas warehouse SKUs)
INSERT INTO tiktok_routing_rules (sku_pattern, warehouse, description) VALUES
  ('WMNSNMNFOR', 'las_vegas', 'Juvanix - Women''s NMN NAD+ Longevity Matrix'),
  ('UROLITHINFOR', 'las_vegas', 'Infinity One - Urolithin A (aka LongevityOne)'),
  ('UROLINMNDUO', 'las_vegas', 'Infinity One + Juvanix Duo Bundle (aka Longevity Duo)')
ON CONFLICT (sku_pattern) DO NOTHING;
