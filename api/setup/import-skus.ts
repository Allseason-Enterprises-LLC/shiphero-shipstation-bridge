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

  try {
    const skus = req.body?.skus;
    if (!Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ error: 'Body must contain skus array' });
    }

    let imported = 0;
    let errors = 0;
    const batchSize = 50;

    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const { error } = await supabase
        .from('sku_master')
        .upsert(
          batch.map((s: any) => ({
            cin7_sku: s.cin7_sku,
            product_name: s.product_name || null,
            sku_identifier: s.sku_identifier || null,
            brand: s.brand || null,
            category: s.category || null,
            form_type: s.form_type || null,
            amz_sku: s.amz_sku || null,
            amz_asin: s.amz_asin || null,
            amz_fnsku: s.amz_fnsku || null,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'cin7_sku' }
        );

      if (error) {
        console.error(`Batch ${i} error:`, error);
        errors += batch.length;
      } else {
        imported += batch.length;
      }
    }

    res.status(200).json({ imported, errors, total: skus.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
