/**
 * POST /api/tiktok/route-order
 * 
 * Webhook endpoint that ShipHero calls when a new TikTok order is created.
 * Routes the order to the appropriate warehouse based on SKU matching.
 * 
 * Can also be called manually with an order_id to route a specific order.
 * 
 * Payload from ShipHero Automation Rule webhook:
 * {
 *   "account_id": "...",
 *   "account_uuid": "...",
 *   "order_id": "...",
 *   "shop_name": "...",
 *   "order_number": "...",
 *   "partner_order_id": "...",
 *   "action_data": "..."
 * }
 * 
 * Or manual call:
 * { "order_id": "T3JkZXI6MTIzNDU2Nzg5" }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { routeTikTokOrder } from '../../lib/tiktok-routing';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: verify webhook secret
  const webhookSecret = process.env.TIKTOK_ROUTING_WEBHOOK_SECRET;
  if (webhookSecret) {
    const authHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
    if (authHeader !== webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'Missing order_id in request body' });
    }

    const decision = await routeTikTokOrder(order_id);

    return res.status(200).json({
      success: true,
      routing: decision,
    });
  } catch (error: any) {
    console.error('TikTok routing error:', error);
    return res.status(500).json({
      error: 'Routing failed',
      message: error.message,
    });
  }
}
