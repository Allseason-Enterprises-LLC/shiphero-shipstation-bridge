import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createFbaRecord,
  getFbaByTransferName,
  resolveTransferItems,
} from '../../lib/fba-orchestrator';

function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Create an FBA shipment record from a CIN7 transfer.
 * Called when the CIN7 → ShipHero bridge detects an FBA-destined transfer.
 * 
 * Body:
 * {
 *   cin7_transfer_id: string,
 *   cin7_transfer_number: string,
 *   shiphero_order_id?: string,
 *   shiphero_order_number?: string,
 *   items: Array<{ sku: string, quantity: number }>,
 *   box?: { length: number, width: number, height: number },
 *   weightLbs?: number
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronSecret(req, res)) return;

  try {
    const {
      cin7_transfer_id,
      cin7_transfer_number,
      shiphero_order_id,
      shiphero_order_number,
      items,
      box,
      weightLbs,
    } = req.body;

    if (!cin7_transfer_number || !items?.length) {
      return res.status(400).json({
        error: 'Required: cin7_transfer_number, items (array of {sku, quantity})',
      });
    }

    // Check for duplicate
    const existing = await getFbaByTransferName(cin7_transfer_number);
    if (existing) {
      return res.status(200).json({
        message: 'FBA record already exists',
        shipment: existing,
        duplicate: true,
      });
    }

    // Validate SKU mappings
    const { resolved, unresolved } = await resolveTransferItems(items);
    
    // Create the FBA record
    const record = await createFbaRecord(
      cin7_transfer_number,
      shiphero_order_id,
      shiphero_order_number,
      items,
      box,
      weightLbs
    );

    // Store the items and box info in request_payload for later processing
    const { error: updateError } = await (await import('../../lib/supabase')).supabase
      .from('cin7_fba_shipments')
      .update({
        status: 'draft',
        request_payload: {
          items,
          box: box || { length: 20, width: 15, height: 12 },
          weightLbs: weightLbs || 25,
          resolved_items: resolved,
          unresolved_items: unresolved,
        },
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('Failed to update request_payload:', updateError);
    }

    res.status(201).json({
      message: 'FBA shipment record created',
      shipment_id: record.id,
      cin7_transfer_number,
      resolved_skus: resolved.length,
      unresolved_skus: unresolved.length,
      unresolved: unresolved.length > 0 ? unresolved : undefined,
      next_step: 'Call POST /api/fba/sync to submit to Amazon',
    });
  } catch (error) {
    console.error('[fba-create-from-transfer] Error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
