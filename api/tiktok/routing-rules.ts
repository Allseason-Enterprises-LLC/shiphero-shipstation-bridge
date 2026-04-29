/**
 * GET/POST /api/tiktok/routing-rules
 * 
 * Manage the SKU routing rules for TikTok orders.
 * 
 * GET: List all active routing rules
 * POST: Add/update/delete routing rules
 * 
 * POST body:
 * { "action": "add", "sku_pattern": "NEWSKU", "warehouse": "las_vegas", "description": "New Product" }
 * { "action": "remove", "sku_pattern": "OLDSKU" }
 * { "action": "list" }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { getLasVegasSkuPatterns, DEFAULT_LAS_VEGAS_SKU_PATTERNS } from '../../lib/tiktok-routing';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth check
  const authHeader = req.headers['authorization'];
  const apiKey = process.env.INTERNAL_API_KEY;
  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET' || (req.method === 'POST' && req.body?.action === 'list')) {
    // List all routing rules
    const { data, error } = await supabase
      .from('tiktok_routing_rules')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      // If table doesn't exist, return defaults
      return res.status(200).json({
        source: 'defaults',
        rules: DEFAULT_LAS_VEGAS_SKU_PATTERNS.map(p => ({
          sku_pattern: p,
          warehouse: 'las_vegas',
          active: true,
        })),
      });
    }

    return res.status(200).json({
      source: 'supabase',
      rules: data,
    });
  }

  if (req.method === 'POST') {
    const { action, sku_pattern, warehouse, description } = req.body;

    if (action === 'add') {
      if (!sku_pattern) {
        return res.status(400).json({ error: 'Missing sku_pattern' });
      }

      const { data, error } = await supabase
        .from('tiktok_routing_rules')
        .upsert({
          sku_pattern: sku_pattern.toUpperCase(),
          warehouse: warehouse || 'las_vegas',
          description: description || null,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'sku_pattern' })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, rule: data });
    }

    if (action === 'remove') {
      if (!sku_pattern) {
        return res.status(400).json({ error: 'Missing sku_pattern' });
      }

      const { error } = await supabase
        .from('tiktok_routing_rules')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('sku_pattern', sku_pattern.toUpperCase());

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, removed: sku_pattern });
    }

    return res.status(400).json({ error: 'Invalid action. Use: list, add, remove' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
