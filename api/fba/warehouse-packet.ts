import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import type { WarehousePacket } from '../../lib/fba-types';

function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Get the warehouse-ready packet for an FBA shipment.
 * Contains everything the warehouse team needs to prepare and ship.
 * 
 * GET /api/fba/warehouse-packet?transfer=CIN7-TR-00030
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronSecret(req, res)) return;

  try {
    const transferNumber = req.query.transfer as string;
    const shipmentId = req.query.id as string;

    if (!transferNumber && !shipmentId) {
      return res.status(400).json({ error: 'Provide ?transfer=CIN7-TR-XXXXX or ?id=uuid' });
    }

    let query = supabase.from('cin7_fba_shipments').select('*');
    if (transferNumber) {
      query = query.eq('cin7_transfer_number', transferNumber);
    } else {
      query = query.eq('id', shipmentId);
    }

    const { data, error } = await query.single();
    if (error || !data) {
      return res.status(404).json({ error: 'FBA shipment not found' });
    }

    const shipment = data as any;

    if (!['fba_created', 'labels_ready', 'warehouse_notified'].includes(shipment.status)) {
      return res.status(400).json({
        error: `Shipment not ready. Current status: ${shipment.status}`,
        shipment_id: shipment.id,
        status: shipment.status,
      });
    }

    // Build the warehouse packet
    const resolvedItems = shipment.request_payload?.resolved_items || [];
    const packet: WarehousePacket = {
      cin7_transfer_number: shipment.cin7_transfer_number,
      shiphero_order_number: shipment.shiphero_order_number || 'N/A',
      amazon_shipment_id: shipment.amazon_shipment_confirmation_ids?.[0] || shipment.amazon_shipment_ids?.[0] || 'N/A',
      amazon_plan_id: shipment.amazon_inbound_plan_id || 'N/A',
      destination_fc: 'See Amazon Seller Central', // TODO: extract from response
      items: resolvedItems.map((item: any) => ({
        cin7_sku: item.cin7Sku || item.cin7_sku,
        amz_sku: item.sellerSku || item.seller_sku,
        fnsku: item.fnsku || '',
        product_name: item.productName || item.product_name || '',
        quantity: item.quantity,
      })),
      label_urls: shipment.label_urls || {},
      prep_instructions: shipment.prep_instructions,
      generated_at: new Date().toISOString(),
    };

    // Mark as warehouse_notified if first access
    if (shipment.status === 'fba_created' || shipment.status === 'labels_ready') {
      await supabase
        .from('cin7_fba_shipments')
        .update({
          status: 'warehouse_notified',
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipment.id);
    }

    res.status(200).json(packet);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
