import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  updateFbaStatus,
  getPendingFbaShipments,
  resolveTransferItems,
  createFbaInboundShipment,
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

interface SyncResult {
  transfer_number: string;
  status: 'success' | 'skipped' | 'failed';
  amazon_plan_id?: string;
  error?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronSecret(req, res)) return;

  const results: SyncResult[] = [];

  try {
    // Get FBA shipments that are ready for Amazon submission
    const pendingFba = await getPendingFbaShipments();
    console.log(`[fba-sync] Found ${pendingFba.length} draft shipments ready for FBA submission`);

    for (const shipment of pendingFba) {
      try {
        // Skip if not draft
        if (shipment.status !== 'draft') continue;

        // Get the transfer items from the request payload
        const transferItems = (shipment.request_payload?.items as Array<{ sku: string; quantity: number }>) || [];
        
        if (transferItems.length === 0) {
          await updateFbaStatus(shipment.id, 'failed', {
            error_message: 'No items in transfer',
            error_at: new Date().toISOString(),
          });
          results.push({
            transfer_number: shipment.cin7_transfer_number,
            status: 'failed',
            error: 'No items in transfer',
          });
          continue;
        }

        // Resolve CIN7 SKUs to Amazon MSKUs
        const { resolved, unresolved } = await resolveTransferItems(transferItems);

        if (resolved.length === 0) {
          await updateFbaStatus(shipment.id, 'failed', {
            error_message: `No resolvable Amazon SKUs. Unresolved: ${unresolved.map(u => `${u.sku}: ${u.reason}`).join(', ')}`,
            error_at: new Date().toISOString(),
          });
          results.push({
            transfer_number: shipment.cin7_transfer_number,
            status: 'failed',
            error: `No Amazon SKU mappings found for: ${unresolved.map(u => u.sku).join(', ')}`,
          });
          continue;
        }

        if (unresolved.length > 0) {
          console.warn(`[fba-sync] ${shipment.cin7_transfer_number}: ${unresolved.length} items couldn't be resolved:`, unresolved);
        }

        // Get box dimensions from request payload or use defaults
        const boxDims = (shipment.request_payload?.box as { length: number; width: number; height: number }) || {
          length: 20, width: 15, height: 12,
        };
        const weightLbs = (shipment.request_payload?.weightLbs as number) || 25;

        // Call BrandMind's existing FBA create endpoint
        const fbaResult = await createFbaInboundShipment(
          shipment.ship_from_warehouse_id || process.env.SHIPHERO_WAREHOUSE_ID!,
          resolved.map(r => ({ sellerSku: r.sellerSku, quantity: r.quantity })),
          boxDims,
          weightLbs
        );

        // Update with Amazon response
        await updateFbaStatus(shipment.id, 'labels_ready', {
          amazon_inbound_plan_id: fbaResult.planId || fbaResult.plan_id,
          amazon_shipment_ids: fbaResult.shipmentIds || fbaResult.amazon_shipment_ids,
          amazon_shipment_confirmation_ids: fbaResult.shipmentConfirmationIds || fbaResult.amazon_internal_shipment_ids,
          box_ids: fbaResult.boxIds || fbaResult.box_ids,
          label_urls: fbaResult.labelsUrl ? { pdf: fbaResult.labelsUrl } : undefined,
          prep_instructions: fbaResult.prepInstructions || fbaResult.prep_instructions,
          response_payload: fbaResult,
          workflow_step: 'fba_created',
        });

        results.push({
          transfer_number: shipment.cin7_transfer_number,
          status: 'success',
          amazon_plan_id: fbaResult.planId || fbaResult.plan_id,
        });

      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[fba-sync] Error processing ${shipment.cin7_transfer_number}:`, msg);
        
        await updateFbaStatus(shipment.id, 'failed', {
          error_message: msg,
          error_at: new Date().toISOString(),
        }).catch(() => {});

        results.push({
          transfer_number: shipment.cin7_transfer_number,
          status: 'failed',
          error: msg,
        });
      }
    }

    res.status(200).json({
      processed: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    });
  } catch (error) {
    console.error('[fba-sync] Fatal error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
