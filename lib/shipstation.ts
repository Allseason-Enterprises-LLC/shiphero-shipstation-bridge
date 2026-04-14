import type { ShipStationLabel } from './types';

const SHIPSTATION_API = 'https://api.shipstation.com/v2';
const API_KEY = process.env.SHIPSTATION_API_KEY!;

interface ShipStationAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

interface ShipStationWeight {
  value: number;
  units: 'ounces' | 'pounds';
}

async function shipstationRequest(
  method: string,
  endpoint: string,
  body?: any
): Promise<any> {
  const response = await fetch(`${SHIPSTATION_API}${endpoint}`, {
    method,
    headers: {
      'api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`ShipStation error: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function generateLabel(
  orderId: string,
  orderNumber: string,
  toAddress: ShipStationAddress,
  weight: number,
  carrierCode: string = 'usps',
  serviceCode: string = 'usps_ground_advantage'
): Promise<ShipStationLabel> {
  const payload = {
    shipment: {
      validate_address: 'validate_and_return',
      ship_from: {
        name: process.env.SHIP_FROM_NAME!,
        street1: process.env.SHIP_FROM_ADDRESS1!,
        city: process.env.SHIP_FROM_CITY!,
        state: process.env.SHIP_FROM_STATE!,
        zip: process.env.SHIP_FROM_ZIP!,
        country: process.env.SHIP_FROM_COUNTRY!,
        phone: process.env.SHIP_FROM_PHONE || '',
      },
      ship_to: {
        name: toAddress.name,
        street1: toAddress.street1,
        street2: toAddress.street2,
        city: toAddress.city,
        state: toAddress.state,
        zip: toAddress.zip,
        country: toAddress.country,
        phone: toAddress.phone || '',
      },
      weight: {
        value: Math.max(weight || 1, 0.25),
        units: 'pounds',
      },
      packages: [
        {
          weight: {
            value: Math.max(weight || 1, 0.25),
            units: 'pounds',
          },
          dimensions: {
            length: 12,
            width: 8,
            height: 6,
            units: 'inches',
          },
        },
      ],
    },
    rate_options: {
      carrier_code: carrierCode,
      service_code: serviceCode,
    },
  };

  const response = await shipstationRequest('POST', '/labels', payload);
  
  return {
    label_id: response.label_id,
    tracking_number: response.tracking_number,
    label_url: response.label_download.href,
    label_download: response.label_download,
    shipment: response.shipment,
    cost: response.shipment.cost,
    created_at: response.created_at,
  };
}

export async function getCarriers(): Promise<any[]> {
  const response = await shipstationRequest('GET', '/carriers');
  return response.carriers || [];
}

export async function rateShop(
  toAddress: ShipStationAddress,
  weight: number
): Promise<Array<{ carrier_code: string; service_code: string; cost: number }>> {
  const payload = {
    shipment: {
      validate_address: 'validate_and_return',
      ship_from: {
        name: process.env.SHIP_FROM_NAME!,
        street1: process.env.SHIP_FROM_ADDRESS1!,
        city: process.env.SHIP_FROM_CITY!,
        state: process.env.SHIP_FROM_STATE!,
        zip: process.env.SHIP_FROM_ZIP!,
        country: process.env.SHIP_FROM_COUNTRY!,
      },
      ship_to: {
        name: toAddress.name,
        street1: toAddress.street1,
        street2: toAddress.street2,
        city: toAddress.city,
        state: toAddress.state,
        zip: toAddress.zip,
        country: toAddress.country,
      },
      weight: {
        value: Math.max(weight || 1, 0.25),
        units: 'pounds',
      },
      packages: [
        {
          weight: {
            value: Math.max(weight || 1, 0.25),
            units: 'pounds',
          },
        },
      ],
    },
  };

  const response = await shipstationRequest('POST', '/rate_quote', payload);
  
  return (response.rate_quote_response?.rates || [])
    .map((rate: any) => ({
      carrier_code: rate.carrier_code,
      service_code: rate.service_code,
      cost: parseFloat(rate.shipping_amount.amount),
    }))
    .sort((a: any, b: any) => a.cost - b.cost);
}
