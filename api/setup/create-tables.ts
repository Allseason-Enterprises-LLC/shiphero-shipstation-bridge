import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronSecret(req, res)) return;

  const results: string[] = [];

  try {
    // Create sku_master table
    const { error: e1 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS sku_master (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          cin7_sku TEXT NOT NULL UNIQUE,
          product_name TEXT,
          sku_identifier TEXT,
          brand TEXT,
          category TEXT,
          form_type TEXT,
          amz_sku TEXT,
          amz_asin TEXT,
          amz_fnsku TEXT,
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_sku_master_cin7 ON sku_master(cin7_sku);
        CREATE INDEX IF NOT EXISTS idx_sku_master_amz ON sku_master(amz_sku);
        CREATE INDEX IF NOT EXISTS idx_sku_master_fnsku ON sku_master(amz_fnsku);
      `
    });
    if (e1) {
      // Try direct insert approach if rpc doesn't exist
      results.push(`sku_master rpc error: ${e1.message} - will try upsert approach`);
    } else {
      results.push('sku_master table created');
    }

    // Create cin7_fba_shipments audit table
    const { error: e2 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS cin7_fba_shipments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          cin7_transfer_id TEXT NOT NULL,
          cin7_transfer_number TEXT NOT NULL,
          shiphero_order_id TEXT,
          shiphero_order_number TEXT,
          amazon_inbound_plan_id TEXT,
          amazon_shipment_ids TEXT[],
          amazon_shipment_confirmation_ids TEXT[],
          box_ids TEXT[],
          status TEXT NOT NULL DEFAULT 'pending_shiphero',
          label_urls JSONB,
          prep_instructions JSONB,
          warehouse_packet_url TEXT,
          error_message TEXT,
          error_at TIMESTAMP,
          workflow_step TEXT,
          request_payload JSONB,
          response_payload JSONB,
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_fba_ship_status ON cin7_fba_shipments(status);
        CREATE INDEX IF NOT EXISTS idx_fba_ship_cin7 ON cin7_fba_shipments(cin7_transfer_number);
      `
    });
    if (e2) {
      results.push(`cin7_fba_shipments rpc error: ${e2.message}`);
    } else {
      results.push('cin7_fba_shipments table created');
    }

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
