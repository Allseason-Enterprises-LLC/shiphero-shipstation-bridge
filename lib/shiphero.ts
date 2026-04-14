import { supabase } from './supabase';
import type { ShipHeroOrder } from './types';

const SHIPHERO_API = 'https://public-api.shiphero.com/graphql';

async function getShipHeroToken(): Promise<string> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('api_credentials')
    .eq('id', process.env.SHIPHERO_WAREHOUSE_ID!)
    .eq('provider', 'shiphero')
    .single();

  if (error) throw new Error(`Failed to get ShipHero token: ${error.message}`);
  const creds = data?.api_credentials as any;
  if (!creds?.accessToken) throw new Error('No ShipHero access token in api_credentials');
  return creds.accessToken;
}

async function gql(query: string, variables?: Record<string, any>): Promise<any> {
  const token = await getShipHeroToken();
  
  const response = await fetch(SHIPHERO_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json: any = await response.json();
  if (json.errors) {
    throw new Error(`ShipHero GQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export async function getReadyToShipOrders(): Promise<ShipHeroOrder[]> {
  const query = `
    query {
      orders(
        fulfillment_status: "pending"
      ) {
        data(first: 50) {
          edges {
            node {
              id
              order_number
              shop_name
              email
              shipping_address {
                first_name
                last_name
                company
                address1
                address2
                city
                state
                zip
                country
                phone
              }
              line_items(first: 50) {
                edges {
                  node {
                    sku
                    quantity
                    product_name
                  }
                }
              }
              tags
              ready_to_ship
              fulfillment_status
            }
          }
        }
      }
    }
  `;

  const data = await gql(query);
  const orders: ShipHeroOrder[] = [];

  data.orders.data.edges.forEach((edge: any) => {
    const node = edge.node;
    const addr = node.shipping_address;
    orders.push({
      id: node.id,
      order_number: node.order_number,
      shop_name: node.shop_name,
      customer_email: node.email || '',
      shipping_address: {
        name: [addr.first_name, addr.last_name].filter(Boolean).join(' '),
        first_name: addr.first_name || '',
        last_name: addr.last_name || '',
        company: addr.company || '',
        street1: addr.address1 || '',
        street2: addr.address2 || undefined,
        city: addr.city || '',
        state: addr.state || '',
        zip: addr.zip || '',
        country: addr.country || 'US',
        phone: addr.phone || '',
      },
      line_items: node.line_items.edges.map((e: any) => ({
        sku: e.node.sku,
        quantity: e.node.quantity,
        weight: undefined,
      })),
      tags: node.tags || [],
      ready_to_ship: node.ready_to_ship,
    });
  });

  return orders;
}

export async function fulfillOrder(
  orderId: string,
  trackingNumber: string,
  carrierName: string,
  labelUrl: string,
  cost: string,
  order: ShipHeroOrder
): Promise<any> {
  const mutation = `
    mutation order_fulfill($data: FulfillOrderInput!) {
      order_fulfill(data: $data) {
        request_id
        complexity
        shipment {
          id
          order_id
        }
      }
    }
  `;

  const addr = order.shipping_address;

  const data = await gql(mutation, {
    data: {
      order_id: orderId,
      tote_id: 'BRIDGE-' + orderId.slice(-8),
      shipped_off_shiphero: true,
      packages: {
        address: {
          first_name: addr.first_name || addr.name?.split(' ')[0] || '',
          last_name: addr.last_name || addr.name?.split(' ').slice(1).join(' ') || '',
          company: addr.company || '',
          address1: addr.street1,
          address2: addr.street2 || '',
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          country: addr.country || 'US',
          phone: addr.phone || '',
          email: order.customer_email || '',
        },
        carrier: carrierName,
        method: 'Ground',
        tracking_number: trackingNumber,
        label_url: labelUrl,
        cost: cost,
        line_items: order.line_items.map(item => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
      },
    },
  });

  return data.order_fulfill;
}
