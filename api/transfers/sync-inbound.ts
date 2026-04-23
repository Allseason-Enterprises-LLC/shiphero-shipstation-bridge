import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getShipHeroToken } from '../../lib/shiphero-product-data';
import { createShipHeroPurchaseOrder } from '../../lib/shiphero-inbound';

export const config = { maxDuration: 120 };

function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Create a ShipHero Purchase Order from a CIN7 inbound transfer.
 * Used when manufacturer → Vegas warehouse (adds inventory).
 *
 * POST /api/transfers/sync-inbound
 * {
 *   cin7_transfer_number: "TR-00028",
 *   from_location: "Aegle Nutrition LLC",
 *   items: [
 *     { sku: "CN-DRP-BLOODSUGAR-2OZ", quantity: 38367, productName: "Gluco Gone Drops 2oz" }
 *   ],
 *   tracking_number: "optional",
 *   note: "optional"
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  try {
    const {
      cin7_transfer_number,
      from_location,
      items,
      tracking_number,
      note,
    } = req.body;

    if (!cin7_transfer_number || !items?.length) {
      return res.status(400).json({
        error: 'Required: cin7_transfer_number, items (array of {sku, quantity})',
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const warehouseId = 'V2FyZWhvdXNlOjEzNTg3Mg=='; // Clean Nutra ShipHero warehouse
    const customerAccountId = '95145'; // Clean Nutra customer account

    // Get ShipHero token
    const shipheroToken = await getShipHeroToken(
      supabaseUrl,
      supabaseKey,
      process.env.SHIPHERO_WAREHOUSE_ID || '22e17170-af72-4bf8-b77c-d73c86b06765'
    );

    // Create PO number from transfer number
    const poNumber = `CIN7-${cin7_transfer_number}`;

    console.log(`[inbound] Creating ShipHero PO ${poNumber} with ${items.length} items from ${from_location || 'unknown'}`);

    // Create the Purchase Order in ShipHero
    const result = await createShipHeroPurchaseOrder(shipheroToken, {
      poNumber,
      warehouseId,
      customerAccountId,
      items: items.map((item: any) => ({
        sku: item.sku,
        quantity: item.quantity,
        productName: item.productName || item.sku,
        weightPerUnit: item.weightPerUnit || 1,
        pricePerUnit: item.pricePerUnit || 0,
      })),
      note: note || `Inbound transfer from ${from_location || 'manufacturer'} — ${cin7_transfer_number}`,
      trackingNumber: tracking_number,
    });

    console.log(`[inbound] PO created: ${result.po_number} (${result.purchase_order_id})`);

    res.status(200).json({
      success: true,
      cin7_transfer_number,
      shiphero_po_number: result.po_number,
      shiphero_po_id: result.purchase_order_id,
      status: result.status,
      items_count: items.length,
      total_units: items.reduce((sum: number, i: any) => sum + i.quantity, 0),
      message: `Purchase Order ${result.po_number} created in ShipHero. Warehouse can now receive inventory against this PO.`,
    });
  } catch (error) {
    console.error('[inbound] Error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
