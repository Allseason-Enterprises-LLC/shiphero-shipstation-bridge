import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runFbaInboundWorkflow } from '../../lib/fba-inbound';

export const config = { maxDuration: 300 };

/**
 * Direct FBA submission - calls Amazon SP-API directly (no brandmind proxy).
 * Includes setPrepDetails + createInboundPlan with proper prepOwner handling.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const {
      shipFromWarehouseId,
      shipFromAddressId,
      marketplaceId = 'ATVPDKIKX0DER',
      items = [],
      box = {},
      weightLbs,
    } = body;

    if (!items.length) {
      return res.status(400).json({ success: false, error: 'Missing items' });
    }

    // Default ship-from address (Las Vegas warehouse)
    const sourceAddress = {
      name: process.env.SHIP_FROM_NAME || 'Clean Nutra',
      addressLine1: process.env.SHIP_FROM_ADDRESS1 || '6425 S Jones Blvd',
      city: process.env.SHIP_FROM_CITY || 'Las Vegas',
      stateOrProvinceCode: process.env.SHIP_FROM_STATE || 'NV',
      postalCode: process.env.SHIP_FROM_ZIP || '89118',
      countryCode: 'US',
      phoneNumber: process.env.SHIP_FROM_PHONE || '7027108850',
      companyName: 'Clean Nutra',
      email: 'shipping@cleannutra.com',
    };

    const credentials = {
      clientId: process.env.AMAZON_CLIENT_ID!,
      clientSecret: process.env.AMAZON_CLIENT_SECRET!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
    };

    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      return res.status(500).json({ success: false, error: 'Missing Amazon SP-API credentials' });
    }

    console.log('[direct-submit] Starting FBA workflow...');
    const result = await runFbaInboundWorkflow({
      credentials,
      marketplaceId,
      sourceAddress,
      items: items.map((i: any) => ({
        sellerSku: i.sellerSku || i.sku,
        quantity: i.quantity,
        expiration: i.expiration,
        prepOwner: i.prepOwner,
      })),
      box: {
        length: Number(box.length),
        width: Number(box.width),
        height: Number(box.height),
        weightLbs: Number(weightLbs || box.weightLbs),
      },
    });

    console.log('[direct-submit] Workflow result:', JSON.stringify(result));
    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[direct-submit] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
