import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

/**
 * Create tables by testing if they exist and creating via workarounds.
 * Since Supabase JS client can't run raw DDL, we use a different strategy:
 * 1. Try to select from the table
 * 2. If it doesn't exist, we know we need it
 * 3. Use the Supabase management API or return instructions
 * 
 * ACTUALLY: We'll just try to upsert into each table.
 * If the table exists, it succeeds. If not, we get an error telling us to create it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results: Record<string, string> = {};

  // Test sku_master
  const { error: skuErr } = await supabase.from('sku_master').select('id').limit(1);
  if (skuErr) {
    results.sku_master = `NOT READY: ${skuErr.message}`;
  } else {
    results.sku_master = 'OK';
  }

  // Test cin7_fba_shipments
  const { error: fbaErr } = await supabase.from('cin7_fba_shipments').select('id').limit(1);
  if (fbaErr) {
    results.cin7_fba_shipments = `NOT READY: ${fbaErr.message}`;
  } else {
    results.cin7_fba_shipments = 'OK';
  }

  // Test bridge_orders (already exists from ShipStation bridge)
  const { error: bridgeErr } = await supabase.from('bridge_orders').select('id').limit(1);
  if (bridgeErr) {
    results.bridge_orders = `NOT READY: ${bridgeErr.message}`;
  } else {
    results.bridge_orders = 'OK';
  }

  const allOk = Object.values(results).every(v => v === 'OK');

  res.status(200).json({
    all_tables_ready: allOk,
    tables: results,
    ...(allOk ? {} : {
      action_needed: 'Run the SQL in Supabase SQL Editor. The SQL was provided in the previous message.',
    }),
  });
}
