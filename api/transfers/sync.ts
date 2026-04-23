import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Smart transfer router. Detects direction and routes to the right handler:
 *
 * - Manufacturer → Vegas (inbound): Creates ShipHero Purchase Order (adds inventory)
 * - Vegas → Amazon FBA (outbound): Creates FBA Inbound Shipment (ships to Amazon)
 *
 * POST /api/transfers/sync
 * {
 *   cin7_transfer_number: "TR-00028",
 *   from_location: "Aegle Nutrition LLC",
 *   to_location: "ASE Warehouse - Vegas",
 *   items: [{ sku: "CN-DRP-BLOODSUGAR-2OZ", quantity: 38367 }]
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const { to_location, from_location } = req.body;
  const toLocationLower = (to_location || '').toLowerCase();

  // Route based on destination
  if (toLocationLower.includes('amazon fba') || toLocationLower.includes('fba warehouse')) {
    // Outbound: Vegas → Amazon FBA
    res.status(200).json({
      route: 'fba_outbound',
      message: 'Use POST /api/fba/auto-submit for FBA-bound transfers',
      endpoint: '/api/fba/auto-submit',
    });
  } else if (
    toLocationLower.includes('ase warehouse') ||
    toLocationLower.includes('vegas') ||
    toLocationLower.includes('clean nutra')
  ) {
    // Inbound: Manufacturer → Vegas
    // Forward to inbound handler
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://shipping-bridge-shipstation-shipher.vercel.app';

    const response = await fetch(`${baseUrl}/api/transfers/sync-inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify(req.body),
    });

    const data: any = await response.json();
    res.status(response.status).json({
      route: 'inbound_po',
      ...(typeof data === 'object' && data !== null ? data : { result: data }),
    });
  } else {
    res.status(400).json({
      error: `Unknown destination: "${to_location}". Expected "ASE Warehouse - Vegas" (inbound) or "Amazon FBA Warehouse" (outbound).`,
      from_location,
      to_location,
    });
  }
}
