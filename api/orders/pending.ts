import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getReadyToShipOrders } from '../../lib/shiphero';
import { getPendingOrders, recordOrder } from '../../lib/supabase';

function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireCronSecret(req, res)) return;

  try {
    // Get orders from ShipHero that are ready to ship
    const shipheroOrders = await getReadyToShipOrders();
    console.log(`Found ${shipheroOrders.length} ready-to-ship orders in ShipHero`);

    // Check which ones we've already recorded
    const pendingBridge = await getPendingOrders();
    const recordedIds = new Set(pendingBridge.map(o => o.shiphero_order_id));

    let newCount = 0;
    for (const order of shipheroOrders) {
      if (!recordedIds.has(order.id)) {
        await recordOrder({
          shiphero_order_id: order.id,
          shiphero_order_number: order.order_number,
          status: 'pending',
        });
        newCount++;
      }
    }

    res.status(200).json({
      total_ready: shipheroOrders.length,
      new_recorded: newCount,
      pending_total: pendingBridge.length + newCount,
    });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
