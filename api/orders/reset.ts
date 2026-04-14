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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireCronSecret(req, res)) return;

  const { shiphero_order_id, reset_all_failed } = req.body;

  try {
    if (reset_all_failed) {
      const { data, error } = await supabase
        .from('bridge_orders')
        .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
        .eq('status', 'failed')
        .select();

      if (error) throw error;
      res.status(200).json({ reset: data?.length || 0 });
    } else if (shiphero_order_id) {
      const { data, error } = await supabase
        .from('bridge_orders')
        .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
        .eq('shiphero_order_id', shiphero_order_id)
        .select();

      if (error) throw error;
      res.status(200).json({ reset: data?.length || 0 });
    } else {
      res.status(400).json({ error: 'Provide shiphero_order_id or reset_all_failed: true' });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
