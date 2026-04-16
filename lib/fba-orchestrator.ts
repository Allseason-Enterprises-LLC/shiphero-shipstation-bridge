import { supabase } from './supabase';
import type { Cin7FbaShipment, FbaShipmentStatus, SkuMaster } from './fba-types';

const BRANDMIND_API_URL = process.env.BRANDMIND_API_URL || 'https://brandmind-api.vercel.app';
const SHIP_FROM_WAREHOUSE_ID = process.env.SHIPHERO_WAREHOUSE_ID!;
const MARKETPLACE_ID = 'ATVPDKIKX0DER'; // US

/**
 * Look up Amazon SKU mapping for a CIN7 SKU
 */
export async function lookupSkuMapping(cin7Sku: string): Promise<SkuMaster | null> {
  const { data, error } = await supabase
    .from('sku_master')
    .select('cin7_sku, product_name, amz_sku, amz_asin, amz_fnsku')
    .eq('cin7_sku', cin7Sku)
    .single();

  if (error || !data) return null;
  return data as SkuMaster;
}

/**
 * Create a new FBA shipment audit record
 */
export async function createFbaRecord(
  cin7TransferId: string,
  cin7TransferNumber: string,
  shipheroOrderId?: string,
  shipheroOrderNumber?: string
): Promise<Cin7FbaShipment> {
  const { data, error } = await supabase
    .from('cin7_fba_shipments')
    .insert([{
      cin7_transfer_id: cin7TransferId,
      cin7_transfer_number: cin7TransferNumber,
      shiphero_order_id: shipheroOrderId,
      shiphero_order_number: shipheroOrderNumber,
      status: shipheroOrderId ? 'shiphero_created' : 'pending_shiphero',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create FBA record: ${error.message}`);
  return data as Cin7FbaShipment;
}

/**
 * Update FBA shipment status
 */
export async function updateFbaStatus(
  id: string,
  status: FbaShipmentStatus,
  updates?: Partial<Cin7FbaShipment>
): Promise<Cin7FbaShipment> {
  const { data, error } = await supabase
    .from('cin7_fba_shipments')
    .update({
      status,
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update FBA record: ${error.message}`);
  return data as Cin7FbaShipment;
}

/**
 * Get pending FBA shipments by status
 */
export async function getFbaShipmentsByStatus(
  status: FbaShipmentStatus | FbaShipmentStatus[]
): Promise<Cin7FbaShipment[]> {
  const statuses = Array.isArray(status) ? status : [status];
  const { data, error } = await supabase
    .from('cin7_fba_shipments')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) throw new Error(`Failed to fetch FBA shipments: ${error.message}`);
  return (data || []) as Cin7FbaShipment[];
}

/**
 * Check if a CIN7 transfer already has an FBA record
 */
export async function getFbaByTransferNumber(transferNumber: string): Promise<Cin7FbaShipment | null> {
  const { data, error } = await supabase
    .from('cin7_fba_shipments')
    .select('*')
    .eq('cin7_transfer_number', transferNumber)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return (data || null) as Cin7FbaShipment | null;
}

/**
 * Call BrandMind's existing FBA create endpoint
 */
export async function createFbaInboundShipment(
  items: Array<{ sellerSku: string; quantity: number }>,
  boxDimensions: { length: number; width: number; height: number },
  weightLbs: number
): Promise<any> {
  const url = `${BRANDMIND_API_URL}/api/shipments/fba/create`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      shipFromWarehouseId: SHIP_FROM_WAREHOUSE_ID,
      marketplaceId: MARKETPLACE_ID,
      items,
      box: boxDimensions,
      weightLbs,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`FBA create failed: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Resolve CIN7 line items to Amazon MSKUs using sku_master
 */
export async function resolveTransferItems(
  cin7Items: Array<{ sku: string; quantity: number }>
): Promise<{
  resolved: Array<{ sellerSku: string; cin7Sku: string; productName: string; quantity: number; fnsku: string }>;
  unresolved: Array<{ sku: string; quantity: number; reason: string }>;
}> {
  const resolved: Array<{ sellerSku: string; cin7Sku: string; productName: string; quantity: number; fnsku: string }> = [];
  const unresolved: Array<{ sku: string; quantity: number; reason: string }> = [];

  for (const item of cin7Items) {
    const mapping = await lookupSkuMapping(item.sku);
    
    if (!mapping) {
      unresolved.push({ ...item, reason: 'CIN7 SKU not found in sku_master' });
      continue;
    }
    
    if (!mapping.amz_sku) {
      unresolved.push({ ...item, reason: 'No Amazon SKU mapped for this CIN7 SKU' });
      continue;
    }

    resolved.push({
      sellerSku: mapping.amz_sku,
      cin7Sku: item.sku,
      productName: mapping.product_name || item.sku,
      quantity: item.quantity,
      fnsku: mapping.amz_fnsku || '',
    });
  }

  return { resolved, unresolved };
}
