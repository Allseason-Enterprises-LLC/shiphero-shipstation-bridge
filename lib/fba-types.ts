export interface Cin7FbaShipment {
  id: string;
  cin7_transfer_id: string;
  cin7_transfer_number: string;
  shiphero_order_id?: string;
  shiphero_order_number?: string;
  amazon_inbound_plan_id?: string;
  amazon_shipment_ids?: string[];
  amazon_shipment_confirmation_ids?: string[];
  box_ids?: string[];
  status: FbaShipmentStatus;
  label_urls?: Record<string, string>;
  prep_instructions?: Record<string, unknown>;
  warehouse_packet_url?: string;
  error_message?: string;
  error_at?: string;
  workflow_step?: string;
  request_payload?: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type FbaShipmentStatus =
  | 'pending_shiphero'
  | 'shiphero_created'
  | 'pending_fba'
  | 'fba_creating'
  | 'fba_created'
  | 'labels_ready'
  | 'warehouse_notified'
  | 'failed';

export interface SkuMaster {
  cin7_sku: string;
  product_name: string;
  amz_sku: string | null;
  amz_asin: string | null;
  amz_fnsku: string | null;
}

export interface WarehousePacket {
  cin7_transfer_number: string;
  shiphero_order_number: string;
  amazon_shipment_id: string;
  amazon_plan_id: string;
  destination_fc: string;
  items: Array<{
    cin7_sku: string;
    amz_sku: string;
    fnsku: string;
    product_name: string;
    quantity: number;
  }>;
  label_urls: Record<string, string>;
  prep_instructions: Record<string, unknown> | null;
  generated_at: string;
}
