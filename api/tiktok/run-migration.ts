/**
 * POST /api/tiktok/run-migration
 * 
 * One-time endpoint to create the tiktok_routing_rules and tiktok_routing_log tables.
 * Delete this file after running successfully.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

const MIGRATION_SQL = `
-- Routing Rules table
CREATE TABLE IF NOT EXISTS tiktok_routing_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku_pattern TEXT NOT NULL UNIQUE,
  warehouse TEXT NOT NULL DEFAULT 'las_vegas',
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Routing Log table
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_routing_log_routed_at ON tiktok_routing_log(routed_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_log_warehouse ON tiktok_routing_log(target_warehouse);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON tiktok_routing_rules(active) WHERE active = true;
`;

const SEED_SQL = `
INSERT INTO tiktok_routing_rules (sku_pattern, warehouse, description) VALUES
  ('WMNSNMNFOR', 'las_vegas', 'Juvanix - Women''s NMN NAD+ Longevity Matrix'),
  ('UROLITHINFOR', 'las_vegas', 'Infinity One - Urolithin A (aka LongevityOne)'),
  ('UROLINMNDUO', 'las_vegas', 'Infinity One + Juvanix Duo Bundle (aka Longevity Duo)')
ON CONFLICT (sku_pattern) DO NOTHING;
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const results: any[] = [];

  try {
    // Create tables
    const { error: createError } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL });
    
    if (createError) {
      // Try individual statements if rpc doesn't work
      // Create routing rules table
      const { error: e1 } = await supabase.from('tiktok_routing_rules').select('id').limit(1);
      if (e1 && e1.code === '42P01') {
        // Table doesn't exist - we need to create it via SQL
        results.push({ step: 'tables', status: 'need_manual_creation', error: createError.message });
        
        // Try direct REST approach - create by inserting (table auto-creation if enabled)
        const { error: insertError } = await supabase
          .from('tiktok_routing_rules')
          .insert({
            sku_pattern: 'WMNSNMNFOR',
            warehouse: 'las_vegas',
            description: 'Juvanix - Women\'s NMN NAD+ Longevity Matrix',
            active: true,
          });
        
        if (insertError) {
          results.push({ 
            step: 'auto_create', 
            status: 'failed', 
            error: insertError.message,
            hint: 'Run the SQL migration manually in Supabase Dashboard → SQL Editor'
          });
        }
      } else {
        results.push({ step: 'tables', status: 'already_exist' });
      }
    } else {
      results.push({ step: 'tables', status: 'created' });
    }

    // Try to seed data
    const { error: seedError } = await supabase
      .from('tiktok_routing_rules')
      .upsert([
        { sku_pattern: 'WMNSNMNFOR', warehouse: 'las_vegas', description: 'Juvanix - Women\'s NMN NAD+ Longevity Matrix', active: true },
        { sku_pattern: 'UROLITHINFOR', warehouse: 'las_vegas', description: 'Infinity One - Urolithin A (aka LongevityOne)', active: true },
        { sku_pattern: 'UROLINMNDUO', warehouse: 'las_vegas', description: 'Infinity One + Juvanix Duo Bundle (aka Longevity Duo)', active: true },
      ], { onConflict: 'sku_pattern' });

    if (seedError) {
      results.push({ step: 'seed', status: 'failed', error: seedError.message });
    } else {
      results.push({ step: 'seed', status: 'inserted' });
    }

    // Verify
    const { data: rules, error: verifyError } = await supabase
      .from('tiktok_routing_rules')
      .select('*');

    results.push({ 
      step: 'verify', 
      status: verifyError ? 'failed' : 'ok',
      rules: rules || [],
      error: verifyError?.message 
    });

    return res.status(200).json({ success: !results.some(r => r.status === 'failed'), results });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, results });
  }
}
