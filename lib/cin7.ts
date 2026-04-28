/**
 * CIN7 API integration for transfer orders.
 * Uses CIN7 Core (Dear Systems) API.
 */

import axios from 'axios';

const CIN7_API_BASE = 'https://inventory.dearsystems.com/ExternalApi/v2';

export interface Cin7TransferInput {
  fromBranchId: string;
  toBranchId: string;
  items: Array<{ productId: string; quantity: number }>;
  reference?: string;
}

export interface Cin7TransferResult {
  taskId: string;
  status: string;
  reference?: string;
}

function getHeaders() {
  const accountId = process.env.CIN7_ACCOUNT_ID;
  const apiKey = process.env.CIN7_API_KEY;
  if (!accountId || !apiKey) throw new Error('Missing CIN7_ACCOUNT_ID or CIN7_API_KEY');
  return {
    'Content-Type': 'application/json',
    'api-auth-accountid': accountId,
    'api-auth-applicationkey': apiKey,
  };
}

/**
 * Create a stock transfer order in CIN7 and authorize it.
 */
export async function createTransferOrder(input: Cin7TransferInput): Promise<Cin7TransferResult> {
  console.log('[cin7] Creating transfer order:', JSON.stringify({
    from: input.fromBranchId, to: input.toBranchId,
    itemCount: input.items.length, reference: input.reference,
  }));

  // Step 1: Create draft transfer
  const createRes = await axios.post(`${CIN7_API_BASE}/StockTransfer`, {
    Status: 'DRAFT',
    From: input.fromBranchId,
    To: input.toBranchId,
    Reference: input.reference || `FBA-${Date.now()}`,
    CostDistributionType: 'Cost',
    InTransitAccount: '1209',
    Lines: input.items.map(i => ({
      ProductID: i.productId,
      TransferQuantity: i.quantity,
    })),
  }, { headers: getHeaders() });

  const taskId = createRes.data?.TaskID;
  if (!taskId) throw new Error('No TaskID returned from CIN7 StockTransfer');
  console.log('[cin7] Draft created:', taskId);

  // Step 2: Authorize to ORDERED
  await axios.post(`${CIN7_API_BASE}/StockTransfer/Order`, {
    TaskID: taskId,
    Status: 'AUTHORISED',
    Lines: input.items.map(i => ({
      ProductID: i.productId,
      TransferQuantity: i.quantity,
    })),
  }, { headers: getHeaders() });

  console.log('[cin7] Transfer authorized (ORDERED)');

  return { taskId, status: 'ORDERED', reference: input.reference };
}

export async function getTransferStatus(taskId: string): Promise<{ status: string; data: any }> {
  const res = await axios.get(`${CIN7_API_BASE}/StockTransferList?Page=1&Limit=1`, {
    headers: getHeaders(),
    params: { TaskID: taskId },
  });
  const transfer = res.data?.StockTransferList?.[0];
  return { status: transfer?.Status || 'UNKNOWN', data: transfer };
}

export const CIN7_BRANCHES = {
  VEGAS: '64145164-af79-4165-b93c-f30f87fa1d97',
  AMAZON_FBA: 'e908f41a-cd87-4319-9f37-ed77289533cf',
};
