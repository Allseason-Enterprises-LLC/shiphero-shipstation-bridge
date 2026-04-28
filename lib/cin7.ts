/**
 * CIN7 API integration for transfer orders.
 * Uses CIN7 Core API for creating and managing stock transfers.
 */

import axios from 'axios';

const CIN7_API_BASE = 'https://api.cin7.com/api/v1';

export interface Cin7TransferItem {
  productId: string;
  quantity: number;
  sku?: string;
}

export interface Cin7TransferInput {
  fromBranchId: string;  // Source warehouse (Vegas: 64145164-af79-4165-b93c-f30f87fa1d97)
  toBranchId: string;    // Destination (FBA: e908f41a-cd87-4319-9f37-ed77289533cf)
  items: Cin7TransferItem[];
  reference?: string;    // Optional reference for the transfer
}

export interface Cin7TransferResult {
  taskId: string;
  status: string;
  reference?: string;
}

function getCin7Credentials(): { accountId: string; apiKey: string } {
  const accountId = process.env.CIN7_ACCOUNT_ID;
  const apiKey = process.env.CIN7_API_KEY;
  
  if (!accountId || !apiKey) {
    throw new Error('Missing CIN7 credentials: CIN7_ACCOUNT_ID and CIN7_API_KEY are required');
  }
  
  return { accountId, apiKey };
}

function getCin7Auth(): { auth: { username: string; password: string } } {
  const { accountId, apiKey } = getCin7Credentials();
  return {
    auth: {
      username: accountId,
      password: apiKey,
    },
  };
}

/**
 * Create a stock transfer order in CIN7.
 * Transfers inventory from one branch (warehouse) to another.
 */
export async function createTransferOrder(input: Cin7TransferInput): Promise<Cin7TransferResult> {
  const { accountId, apiKey } = getCin7Credentials();
  
  console.log('[cin7] Creating transfer order:', JSON.stringify({
    from: input.fromBranchId,
    to: input.toBranchId,
    itemCount: input.items.length,
    reference: input.reference,
  }));
  
  // CIN7 stock transfer API
  // The endpoint expects a stock transfer object
  const transferData = {
    branchIdFrom: input.fromBranchId,
    branchIdTo: input.toBranchId,
    reference: input.reference || `FBA-${Date.now()}`,
    lineItems: input.items.map((item, idx) => ({
      productId: item.productId,
      qty: item.quantity,
      // Line items are 1-indexed in CIN7
      row: idx + 1,
    })),
  };
  
  try {
    // First, create the transfer in DRAFT status
    const createResponse = await axios.post(
      `${CIN7_API_BASE}/StockTransfer`,
      transferData,
      getCin7Auth()
    );
    
    console.log('[cin7] Create transfer response:', JSON.stringify(createResponse.data));
    
    const transferId = createResponse.data?.id || createResponse.data?.taskId;
    if (!transferId) {
      throw new Error('No transfer ID returned from CIN7');
    }
    
    // Authorize the transfer to ORDERED status
    console.log('[cin7] Authorizing transfer to ORDERED status...');
    const authorizeResponse = await axios.put(
      `${CIN7_API_BASE}/StockTransfer/${transferId}/Authorize`,
      {},
      getCin7Auth()
    );
    
    console.log('[cin7] Authorize response:', JSON.stringify(authorizeResponse.data));
    
    return {
      taskId: transferId,
      status: 'ORDERED',
      reference: input.reference,
    };
  } catch (err: any) {
    console.error('[cin7] Error creating transfer:', err?.response?.data || err?.message);
    throw new Error(`CIN7 transfer failed: ${err?.response?.data?.message || err?.message}`);
  }
}

/**
 * Get transfer order status from CIN7.
 */
export async function getTransferStatus(taskId: string): Promise<{ status: string; data: any }> {
  try {
    const response = await axios.get(
      `${CIN7_API_BASE}/StockTransfer/${taskId}`,
      getCin7Auth()
    );
    
    return {
      status: response.data?.status || 'UNKNOWN',
      data: response.data,
    };
  } catch (err: any) {
    console.error('[cin7] Error getting transfer status:', err?.response?.data || err?.message);
    throw new Error(`CIN7 get status failed: ${err?.response?.data?.message || err?.message}`);
  }
}

// Branch IDs for common locations
export const CIN7_BRANCHES = {
  VEGAS: '64145164-af79-4165-b93c-f30f87fa1d97',
  AMAZON_FBA: 'e908f41a-cd87-4319-9f37-ed77289533cf',
};
