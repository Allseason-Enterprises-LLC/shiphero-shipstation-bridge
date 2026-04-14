import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPendingOrders } from '../../lib/supabase';
import { getReadyToShipOrders, createShipment } from '../../lib/shiphero';
import { generateLabel, rateShop } from '../../lib/shipstation';
import { updateOrderStatus } from '../../lib/supabase';

function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

interface SyncResult {
  order_number: string;
  tracking_number?: string;
  status: 'success' | 'failed';
  error?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireCronSecret(req, res)) return;

  const results: SyncResult[] = [];

  try {
    // Get pending orders from bridge DB
    const pendingOrders = await getPendingOrders();
    console.log(`Found ${pendingOrders.length} pending orders to process`);

    // Fetch full order details from ShipHero
    const shipheroOrders = await getReadyToShipOrders();
    const orderMap = new Map(shipheroOrders.map(o => [o.id, o]));

    for (const bridgeOrder of pendingOrders) {
      const order = orderMap.get(bridgeOrder.shiphero_order_id);
      if (!order) {
        results.push({
          order_number: bridgeOrder.shiphero_order_number,
          status: 'failed',
          error: 'Order no longer found in ShipHero',
        });
        continue;
      }

      try {
        // Calculate weight
        const totalWeight = order.line_items.reduce((sum, item) => {
          return sum + ((item.weight || 1) * item.quantity);
        }, 0) || 1;

        // Rate shop
        const rates = await rateShop(order.shipping_address, totalWeight);
        if (rates.length === 0) {
          throw new Error('No shipping rates available');
        }

        const cheapest = rates[0];
        console.log(`[${order.order_number}] Generating label with ${cheapest.carrier_id} ($${cheapest.cost})`);

        // Generate label
        const label = await generateLabel(
          order.id,
          order.order_number,
          order.shipping_address,
          totalWeight,
          cheapest.carrier_id,
          cheapest.service_code
        );

        // Create shipment in ShipHero
        await createShipment(
          order.id,
          label.tracking_number,
          cheapest.service_code
        );

        // Update bridge DB
        await updateOrderStatus(bridgeOrder.shiphero_order_id, 'success', {
          shipstation_label_id: label.label_id,
          tracking_number: label.tracking_number,
          label_url: label.label_url,
        });

        results.push({
          order_number: order.order_number,
          tracking_number: label.tracking_number,
          status: 'success',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${order.order_number}] Error:`, msg);
        
        await updateOrderStatus(bridgeOrder.shiphero_order_id, 'failed', {
          error: msg,
        });

        results.push({
          order_number: order.order_number,
          status: 'failed',
          error: msg,
        });
      }
    }

    res.status(200).json({
      processed: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
