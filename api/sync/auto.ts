import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPendingOrders, recordOrder, getOrderByShipHeroId } from '../../lib/supabase';
import { getReadyToShipOrders, createShipmentWithTracking } from '../../lib/shiphero';
import { generateLabel, rateShop } from '../../lib/shipstation';
import { updateOrderStatus } from '../../lib/supabase';

export const config = { maxDuration: 120 };

function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth === process.env.CRON_SECRET) return true;
  // Allow Vercel cron
  if (req.headers['x-vercel-cron'] === '1' && process.env.VERCEL === '1') return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAuth(req, res)) return;

  const results: Array<{ order_number: string; status: string; tracking?: string; error?: string }> = [];
  const maxToProcess = 10; // Process max 10 per run to stay within timeout

  try {
    // Step 1: Pull ready-to-ship orders from ShipHero and record new ones
    const shipheroOrders = await getReadyToShipOrders();
    let newRecorded = 0;

    for (const order of shipheroOrders) {
      const existing = await getOrderByShipHeroId(order.id);
      if (!existing) {
        await recordOrder({
          shiphero_order_id: order.id,
          shiphero_order_number: order.order_number,
          status: 'pending',
        });
        newRecorded++;
      }
    }

    // Step 2: Get pending bridge orders and generate labels
    const pendingOrders = await getPendingOrders();
    const orderMap = new Map(shipheroOrders.map(o => [o.id, o]));
    let processed = 0;

    for (const bridgeOrder of pendingOrders) {
      if (processed >= maxToProcess) break;

      const order = orderMap.get(bridgeOrder.shiphero_order_id);
      if (!order) continue;

      try {
        await updateOrderStatus(bridgeOrder.shiphero_order_id, 'generating');

        const totalWeight = order.line_items.reduce((sum, item) => {
          return sum + ((item.weight || 1) * item.quantity);
        }, 0) || 1;

        const rates = await rateShop(order.shipping_address, totalWeight);
        if (rates.length === 0) throw new Error('No shipping rates available');

        const cheapest = rates[0];
        const label = await generateLabel(
          order.id,
          order.order_number,
          order.shipping_address,
          totalWeight,
          cheapest.carrier_id,
          cheapest.service_code
        );

        await createShipmentWithTracking(
          order.id,
          label.tracking_number,
          cheapest.service_code,
          label.label_url,
          String(cheapest.cost),
          order
        );

        await updateOrderStatus(bridgeOrder.shiphero_order_id, 'success', {
          shipstation_label_id: label.label_id,
          tracking_number: label.tracking_number,
          label_url: label.label_url,
        });

        results.push({
          order_number: order.order_number,
          status: 'success',
          tracking: label.tracking_number,
        });
        processed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await updateOrderStatus(bridgeOrder.shiphero_order_id, 'failed', { error: msg }).catch(() => {});
        results.push({
          order_number: order.order_number,
          status: 'failed',
          error: msg,
        });
        processed++;
      }
    }

    res.status(200).json({
      new_orders_found: newRecorded,
      pending_in_queue: pendingOrders.length,
      processed: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
