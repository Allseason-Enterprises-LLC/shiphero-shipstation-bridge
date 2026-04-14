import { supabase } from './supabase';
import type { ShipHeroOrder } from './types';

const SHIPHERO_API = 'https://public-api.shiphero.com/graphql';

async function getShipHeroToken(): Promise<string> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('jwt_token')
    .eq('id', process.env.SHIPHERO_WAREHOUSE_ID!)
    .single();

  if (error) throw new Error(`Failed to get ShipHero token: ${error.message}`);
  if (!data?.jwt_token) throw new Error('No JWT token stored in Supabase');
  return data.jwt_token;
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
        filter: { ready_to_ship: false }
        first: 50
      ) {
        data(first: 50) {
          edges {
            node {
              id
              order_number
              shop_name
              customer_email
              shipping_address {
                name
                street1
                street2
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
                    weight
                  }
                }
              }
              tags
              ready_to_ship
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
    orders.push({
      id: node.id,
      order_number: node.order_number,
      shop_name: node.shop_name,
      customer_email: node.customer_email,
      shipping_address: node.shipping_address,
      line_items: node.line_items.edges.map((e: any) => ({
        sku: e.node.sku,
        quantity: e.node.quantity,
        weight: e.node.weight,
      })),
      tags: node.tags || [],
      ready_to_ship: node.ready_to_ship,
    });
  });

  return orders;
}

export async function createShipment(
  orderId: string,
  trackingNumber: string,
  carrierCode: string
): Promise<{ shipment_id: string }> {
  const mutation = `
    mutation CreateShipment($orderId: ID!, $trackingNumber: String!, $carrierCode: String!) {
      shipment_create(
        order_id: $orderId
        shipment: {
          tracking_number: $trackingNumber
          carrier_code: $carrierCode
        }
      ) {
        shipment_id
        order_id
      }
    }
  `;

  const data = await gql(mutation, {
    orderId,
    trackingNumber,
    carrierCode,
  });

  return data.shipment_create;
}
