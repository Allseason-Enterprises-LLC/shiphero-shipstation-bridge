/**
 * Create Purchase Orders in ShipHero for inbound inventory transfers.
 * Used when manufacturer → Vegas warehouse (adds inventory).
 */

const SHIPHERO_API = 'https://public-api.shiphero.com/graphql';

export interface InboundLineItem {
  sku: string;
  quantity: number;
  productName?: string;
  weightPerUnit?: number;
  pricePerUnit?: number;
}

export interface InboundPOResult {
  purchase_order_id: string;
  po_number: string;
  status: string;
}

/**
 * Create a Purchase Order in ShipHero to receive inbound inventory.
 */
export async function createShipHeroPurchaseOrder(
  token: string,
  params: {
    poNumber: string;
    warehouseId: string;
    customerAccountId?: string;
    vendorName?: string;
    items: InboundLineItem[];
    note?: string;
    trackingNumber?: string;
    expectedDate?: string;
  }
): Promise<InboundPOResult> {
  const lineItems = params.items.map(item => ({
    sku: item.sku,
    quantity: item.quantity,
    expected_weight_in_lbs: String(item.weightPerUnit || 1),
    price: String(item.pricePerUnit || 0),
    product_name: item.productName || item.sku,
  }));

  const subtotal = params.items.reduce((sum, i) => sum + (i.quantity * (i.pricePerUnit || 0)), 0);

  const mutation = `
    mutation CreatePO($data: CreatePurchaseOrderInput!) {
      purchase_order_create(data: $data) {
        request_id
        complexity
        purchase_order {
          id
          po_number
          fulfillment_status
          warehouse {
            id
          }
        }
      }
    }
  `;

  const variables = {
    data: {
      po_number: params.poNumber,
      warehouse_id: params.warehouseId,
      customer_account_id: params.customerAccountId || undefined,
      subtotal: String(subtotal),
      shipping_price: '0',
      total_price: String(subtotal),
      line_items: lineItems,
      po_note: params.note || `CIN7 Transfer ${params.poNumber}`,
      tracking_number: params.trackingNumber || undefined,
      fulfillment_status: 'pending',
    },
  };

  const response = await fetch(SHIPHERO_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const json: any = await response.json();
  if (json.errors) {
    throw new Error(`ShipHero PO creation failed: ${JSON.stringify(json.errors)}`);
  }

  const po = json.data?.purchase_order_create?.purchase_order;
  if (!po) {
    throw new Error(`ShipHero PO creation returned no data: ${JSON.stringify(json)}`);
  }

  return {
    purchase_order_id: po.id,
    po_number: po.po_number,
    status: po.fulfillment_status,
  };
}
