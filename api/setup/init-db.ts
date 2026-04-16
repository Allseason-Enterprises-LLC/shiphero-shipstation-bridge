import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Initialize database tables by running SQL directly via Supabase's SQL endpoint.
 * Uses the service role key which has full database access.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const sql = `
    -- Drop and recreate sku_master
    DROP TABLE IF EXISTS sku_master;
    
    CREATE TABLE sku_master (
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
    
    CREATE INDEX idx_sku_master_cin7 ON sku_master(cin7_sku);
    CREATE INDEX idx_sku_master_amz ON sku_master(amz_sku);
    CREATE INDEX idx_sku_master_fnsku ON sku_master(amz_fnsku);
    
    -- FBA shipments audit table
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
  `;

  try {
    // Use Supabase's SQL API endpoint (available to service_role)
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    // If RPC doesn't work, try the pg-meta SQL endpoint
    if (!response.ok) {
      // Try pg-meta endpoint
      const pgResponse = await fetch(`${supabaseUrl}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!pgResponse.ok) {
        // Last resort: try individual table creation via REST
        // Create sku_master by inserting a dummy row (table must exist)
        // This won't work for table creation. Return the SQL for manual execution.
        return res.status(200).json({
          message: 'Auto-creation not available. Run this SQL manually in Supabase SQL Editor.',
          sql,
          hint: 'Copy the SQL above and paste into Supabase → SQL Editor → Run',
        });
      }

      const pgData = await pgResponse.json();
      return res.status(200).json({ success: true, method: 'pg-meta', result: pgData });
    }

    const data = await response.json();
    res.status(200).json({ success: true, method: 'rpc', result: data });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
