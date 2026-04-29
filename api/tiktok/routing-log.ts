/**
 * GET /api/tiktok/routing-log
 * 
 * View recent routing decisions for audit/debugging.
 * 
 * Query params:
 * - limit: number of records (default 50, max 200)
 * - warehouse: filter by target warehouse (las_vegas | clearship)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const authHeader = req.headers['authorization'];
  const apiKey = process.env.INTERNAL_API_KEY;
  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const warehouse = req.query.warehouse as string | undefined;

  let query = supabase
    .from('tiktok_routing_log')
    .select('*')
    .order('routed_at', { ascending: false })
    .limit(limit);

  if (warehouse) {
    query = query.eq('target_warehouse', warehouse);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    total: data?.length || 0,
    log: data,
  });
}
