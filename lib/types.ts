export interface ShipHeroOrder {
  id: string;
  order_number: string;
  shop_name: string;
  customer_email: string;
  shipping_address: {
    name: string;
    first_name: string;
    last_name: string;
    company: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
  };
  line_items: Array<{
    sku: string;
    quantity: number;
    weight?: number;
  }>;
  tags: string[];
  ready_to_ship: boolean;
}

export interface ShipStationLabel {
  label_id: string;
  tracking_number: string;
  label_url: string;
  label_download: {
    href: string;
  };
  shipment: {
    carrier_code: string;
    service_code: string;
  };
  cost: number;
  created_at: string;
}

export interface BridgeOrder {
  id: string;
  shiphero_order_id: string;
  shiphero_order_number: string;
  shipstation_label_id?: string;
  tracking_number?: string;
  label_url?: string;
  status: 'pending' | 'generating' | 'success' | 'failed';
  error?: string;
  created_at: string;
  updated_at: string;
}
