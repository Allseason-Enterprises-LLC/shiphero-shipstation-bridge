import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createFbaRecord,
  getFbaByTransferName,
  resolveTransferItems,
  createFbaInboundShipment,
  updateFbaStatus,
} from '../../lib/fba-orchestrator';

// Allow up to 5 minutes for FBA workflow
export const config = { maxDuration: 300 };

function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * One-shot endpoint: Creates FBA record, resolves SKUs, and submits to Amazon in one call.
 * 
 * POST /api/fba/create-and-submit
 * {
 *   cin7_transfer_number: "TR-00027",
 *   items: [{ sku: "CN-POW-WMNSCREATIORA-30SV", quantity: 90 }],
 *   box: { length: 20, width: 15, height: 12 },
 *   weightLbs: 30
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronSecret(req, res)) return;

  try {
    const {
      cin7_transfer_number,
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
    if (existing && existing.status !== 'failed' && existing.status !== 'cancelled') {
      return res.status(200).json({
        message: 'FBA shipment already exists',
        shipment: existing,
        duplicate: true,
      });
    }

    // Resolve CIN7 SKUs to Amazon MSKUs
    const { resolved, unresolved } = await resolveTransferItems(items);
    
    if (resolved.length === 0) {
      return res.status(400).json({
        error: 'No Amazon SKU mappings found',
        unresolved,
      });
    }

    console.log(`[fba] TR-${cin7_transfer_number}: ${resolved.length} SKUs resolved, ${unresolved.length} unresolved`);
    if (unresolved.length > 0) {
      console.warn(`[fba] Unresolved:`, unresolved);
    }

    // Create FBA record in DB
    let record;
    if (existing && (existing.status === 'failed' || existing.status === 'cancelled')) {
      // Reset existing failed record
      record = await updateFbaStatus(existing.id, 'draft');
    } else {
      record = await createFbaRecord(
        cin7_transfer_number,
        undefined,
        undefined,
        items,
        box,
        weightLbs
      );
    }

    console.log(`[fba] Created record ${record.id}, now submitting to Amazon...`);

    // Submit to Amazon via BrandMind's existing FBA endpoint
    const boxDims = box || { length: 20, width: 15, height: 12 };
    const weight = weightLbs || 25;

    // Map expiration dates from input items to resolved items
    const itemExpirations: Record<string, string> = {};
    for (const item of items) {
      if (item.expiration) {
        itemExpirations[item.sku] = item.expiration;
      }
    }

    const fbaResult = await createFbaInboundShipment(
      record.ship_from_warehouse_id || process.env.SHIPHERO_WAREHOUSE_ID!,
      resolved.map(r => ({
        sellerSku: r.sellerSku,
        quantity: r.quantity,
        expiration: itemExpirations[r.cin7Sku] || undefined,
      })),
      boxDims,
      weight
    );

    // Update record with Amazon response
    const updatedRecord = await updateFbaStatus(record.id, 'labels_ready', {
      plan_id: fbaResult.planId || fbaResult.plan_id,
      amazon_shipment_ids: fbaResult.shipmentIds || fbaResult.amazon_shipment_ids,
      amazon_internal_shipment_ids: fbaResult.shipmentConfirmationIds,
      box_ids: fbaResult.boxIds || fbaResult.box_ids,
      labels_url: fbaResult.labelsUrl,
      prep_instructions: fbaResult.prepInstructions || fbaResult.prep_instructions,
    });

    res.status(200).json({
      success: true,
      cin7_transfer_number,
      shipment_id: record.id,
      amazon_plan_id: fbaResult.planId || fbaResult.plan_id,
      amazon_shipment_ids: fbaResult.shipmentIds || fbaResult.amazon_shipment_ids,
      box_ids: fbaResult.boxIds || fbaResult.box_ids,
      labels_url: fbaResult.labelsUrl,
      resolved_items: resolved,
      unresolved_items: unresolved.length > 0 ? unresolved : undefined,
      status: 'labels_ready',
    });
  } catch (error) {
    console.error('[fba] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
