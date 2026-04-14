import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateLabel, rateShop } from '../../lib/shipstation';
import { getReadyToShipOrders, createShipment } from '../../lib/shiphero';
import { getOrderByShipHeroId, updateOrderStatus } from '../../lib/supabase';

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

  const { shiphero_order_id } = req.body;
  if (!shiphero_order_id) {
    res.status(400).json({ error: 'Missing shiphero_order_id' });
    return;
  }

  try {
    // Get the order from bridge DB
    const bridgeOrder = await getOrderByShipHeroId(shiphero_order_id);
    if (!bridgeOrder) {
      res.status(404).json({ error: 'Order not found in bridge DB' });
      return;
    }

    if (bridgeOrder.status !== 'pending') {
      res.status(400).json({ error: `Order already ${bridgeOrder.status}` });
      return;
    }

    // Mark as generating
    await updateOrderStatus(shiphero_order_id, 'generating');

    // Fetch full order details from ShipHero
    const shipheroOrders = await getReadyToShipOrders();
    const order = shipheroOrders.find(o => o.id === shiphero_order_id);
    
    if (!order) {
      await updateOrderStatus(shiphero_order_id, 'failed', {
        error: 'Order not found in ShipHero',
      });
      res.status(404).json({ error: 'Order not found in ShipHero' });
      return;
    }

    // Calculate total weight (default 1 lb if not specified)
    const totalWeight = order.line_items.reduce((sum, item) => {
      return sum + ((item.weight || 1) * item.quantity);
    }, 0) || 1;

    // Rate shop to find cheapest option
    const rates = await rateShop(order.shipping_address, totalWeight);
    if (rates.length === 0) {
      throw new Error('No shipping rates available');
    }

    const cheapest = rates[0];
    console.log(`Generating label for ${order.order_number} with ${cheapest.carrier_code} ${cheapest.service_code} ($${cheapest.cost})`);

    // Generate label in ShipStation
    const label = await generateLabel(
      order.id,
      order.order_number,
      order.shipping_address,
      totalWeight,
      cheapest.carrier_code,
      cheapest.service_code
    );

    // Create shipment in ShipHero with tracking
    const shipment = await createShipment(
      order.id,
      label.tracking_number,
      cheapest.carrier_code
    );

    // Update bridge DB with success
    await updateOrderStatus(shiphero_order_id, 'success', {
      shipstation_label_id: label.label_id,
      tracking_number: label.tracking_number,
      label_url: label.label_url,
    });

    res.status(200).json({
      order_number: order.order_number,
      tracking_number: label.tracking_number,
      carrier: cheapest.carrier_code,
      service: cheapest.service_code,
      cost: cheapest.cost,
      label_url: label.label_url,
    });
  } catch (error) {
    console.error('Error generating label:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    
    if (shiphero_order_id) {
      await updateOrderStatus(shiphero_order_id, 'failed', { error: msg });
    }

    res.status(500).json({ error: msg });
  }
}
