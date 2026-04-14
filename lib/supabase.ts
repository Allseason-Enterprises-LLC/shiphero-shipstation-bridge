import { createClient } from '@supabase/supabase-js';
import type { BridgeOrder } from './types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function initializeSchema() {
  // Create bridge_orders table if it doesn't exist
  const { error } = await supabase.rpc('create_bridge_table');
  if (error && !error.message.includes('already exists')) {
    console.error('Schema init error:', error);
    throw error;
  }
}

export async function recordOrder(order: Omit<BridgeOrder, 'id' | 'created_at' | 'updated_at'>): Promise<BridgeOrder> {
  const { data, error } = await supabase
    .from('bridge_orders')
    .insert([{
      ...order,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateOrderStatus(
  shipheroOrderId: string,
  status: BridgeOrder['status'],
  updates?: Partial<BridgeOrder>
) {
  const { data, error } = await supabase
    .from('bridge_orders')
    .update({
      status,
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('shiphero_order_id', shipheroOrderId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPendingOrders(): Promise<BridgeOrder[]> {
  const { data, error } = await supabase
    .from('bridge_orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function getOrderByShipHeroId(orderId: string): Promise<BridgeOrder | null> {
  const { data, error } = await supabase
    .from('bridge_orders')
    .select('*')
    .eq('shiphero_order_id', orderId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // 116 = no rows
  return data || null;
}
