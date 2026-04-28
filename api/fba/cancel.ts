import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SellingPartnerApiAuth } from '@sp-api-sdk/auth';
import { FulfillmentInboundApiClient } from '@sp-api-sdk/fulfillment-inbound-api-2024-03-20';

export const config = { maxDuration: 60 };

/**
 * Cancel an FBA inbound plan.
 * POST /api/fba/cancel
 * { "planId": "wf..." }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const planId = req.body?.planId as string;
  if (!planId) return res.status(400).json({ error: 'Missing planId' });

  try {
    const auth = new SellingPartnerApiAuth({
      clientId: process.env.AMAZON_CLIENT_ID!,
      clientSecret: process.env.AMAZON_CLIENT_SECRET!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
    });
    const client = new FulfillmentInboundApiClient({ auth, region: 'na' });

    const result = await client.cancelInboundPlan({ inboundPlanId: planId });
    return res.json({ success: true, planId, data: result.data });
  } catch (err: any) {
    return res.status(500).json({ 
      success: false, 
      error: err.message,
      details: err.response?.data 
    });
  }
}
