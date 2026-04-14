import type { ShipStationLabel } from './types';

const SHIPSTATION_API = 'https://api.shipstation.com/v2';
const API_KEY = process.env.SHIPSTATION_API_KEY!;

interface ShipAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
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

export async function getCarriers(): Promise<any[]> {
  const response = await shipstationRequest('GET', '/carriers');
  return response.carriers || [];
}

export async function getCarrierServices(carrierId: string): Promise<any[]> {
  const response = await shipstationRequest('GET', `/carriers/${carrierId}/services`);
  return response.services || [];
}

export async function getRates(
  carrierId: string,
  toAddress: ShipAddress,
  weightOz: number
): Promise<any[]> {
  const payload = {
    rate_options: {
      carrier_ids: [carrierId],
    },
    shipment: {
      ship_from: {
        name: process.env.SHIP_FROM_NAME!,
        address_line1: process.env.SHIP_FROM_ADDRESS1!,
        city_locality: process.env.SHIP_FROM_CITY!,
        state_province: process.env.SHIP_FROM_STATE!,
        postal_code: process.env.SHIP_FROM_ZIP!,
        country_code: process.env.SHIP_FROM_COUNTRY!,
        phone: process.env.SHIP_FROM_PHONE || '+1 000-000-0000',
      },
      ship_to: {
        name: toAddress.name,
        address_line1: toAddress.street1,
        address_line2: toAddress.street2 || undefined,
        city_locality: toAddress.city,
        state_province: toAddress.state,
        postal_code: toAddress.zip,
        country_code: toAddress.country || 'US',
        phone: toAddress.phone || '+1 000-000-0000',
      },
      packages: [
        {
          weight: {
            value: weightOz,
            unit: 'ounce',
          },
        },
      ],
    },
  };

  const response = await shipstationRequest('POST', '/rates', payload);
  return response.rate_response?.rates || [];
}

export async function generateLabel(
  orderId: string,
  orderNumber: string,
  toAddress: ShipAddress,
  weightLbs: number,
  carrierId: string = 'se-5326057',
  serviceCode: string = 'usps_ground_advantage'
): Promise<ShipStationLabel> {
  const weightOz = Math.max(Math.round(weightLbs * 16), 4); // min 4oz

  const payload = {
    shipment: {
      carrier_id: carrierId,
      service_code: serviceCode,
      ship_from: {
        name: process.env.SHIP_FROM_NAME!,
        company_name: 'Clean Nutra',
        address_line1: process.env.SHIP_FROM_ADDRESS1!,
        city_locality: process.env.SHIP_FROM_CITY!,
        state_province: process.env.SHIP_FROM_STATE!,
        postal_code: process.env.SHIP_FROM_ZIP!,
        country_code: process.env.SHIP_FROM_COUNTRY!,
        phone: process.env.SHIP_FROM_PHONE || '+1 000-000-0000',
      },
      ship_to: {
        name: toAddress.name,
        address_line1: toAddress.street1,
        address_line2: toAddress.street2 || undefined,
        city_locality: toAddress.city,
        state_province: toAddress.state,
        postal_code: toAddress.zip,
        country_code: toAddress.country || 'US',
        phone: toAddress.phone || '+1 000-000-0000',
        address_residential_indicator: 'yes',
      },
      packages: [
        {
          weight: {
            value: weightOz,
            unit: 'ounce',
          },
          dimensions: {
            length: 12,
            width: 8,
            height: 6,
            unit: 'inch',
          },
        },
      ],
    },
  };

  const response = await shipstationRequest('POST', '/labels', payload);

  return {
    label_id: response.label_id,
    tracking_number: response.tracking_number,
    label_url: response.label_download?.href || response.label_download?.pdf || '',
    label_download: response.label_download,
    shipment: {
      carrier_code: carrierId,
      service_code: serviceCode,
    },
    cost: parseFloat(response.shipment_cost?.amount || '0'),
    created_at: response.created_at || new Date().toISOString(),
  };
}

export async function rateShop(
  toAddress: ShipAddress,
  weightLbs: number
): Promise<Array<{ carrier_id: string; service_code: string; cost: number; delivery_days: number | null }>> {
  const weightOz = Math.max(Math.round(weightLbs * 16), 4);

  const payload = {
    rate_options: {
      carrier_ids: ['se-5326057'], // USPS
    },
    shipment: {
      ship_from: {
        name: process.env.SHIP_FROM_NAME!,
        address_line1: process.env.SHIP_FROM_ADDRESS1!,
        city_locality: process.env.SHIP_FROM_CITY!,
        state_province: process.env.SHIP_FROM_STATE!,
        postal_code: process.env.SHIP_FROM_ZIP!,
        country_code: process.env.SHIP_FROM_COUNTRY!,
        phone: process.env.SHIP_FROM_PHONE || '+1 000-000-0000',
      },
      ship_to: {
        name: toAddress.name,
        address_line1: toAddress.street1,
        address_line2: toAddress.street2 || undefined,
        city_locality: toAddress.city,
        state_province: toAddress.state,
        postal_code: toAddress.zip,
        country_code: toAddress.country || 'US',
        phone: toAddress.phone || '+1 000-000-0000',
      },
      packages: [
        {
          weight: {
            value: weightOz,
            unit: 'ounce',
          },
        },
      ],
    },
  };

  const response = await shipstationRequest('POST', '/rates', payload);
  const rates = response.rate_response?.rates || [];

  return rates
    .map((rate: any) => ({
      carrier_id: rate.carrier_id,
      service_code: rate.service_code,
      cost: parseFloat(rate.shipping_amount?.amount || '0'),
      delivery_days: rate.delivery_days || null,
    }))
    .sort((a: any, b: any) => a.cost - b.cost);
}
