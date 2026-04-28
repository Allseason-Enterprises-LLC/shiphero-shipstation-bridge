import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SellingPartnerApiAuth } from '@sp-api-sdk/auth';
import axios from 'axios';

export const config = { maxDuration: 60 };

/**
 * Cancel an FBA inbound plan.
 * POST /api/fba/cancel { "planId": "wf..." }
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

    const token = await auth.getAccessToken();
    const url = `https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/${planId}/cancellation`;
    
    const response = await axios.put(url, {}, {
      headers: {
        'x-amz-access-token': token,
        'Content-Type': 'application/json',
      },
    });

    return res.json({ success: true, planId, data: response.data });
  } catch (err: any) {
    return res.status(500).json({ 
      success: false, 
      error: err.message,
      details: err.response?.data 
    });
  }
}
