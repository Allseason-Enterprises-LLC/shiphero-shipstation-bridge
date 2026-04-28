import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SellingPartnerApiAuth } from '@sp-api-sdk/auth';
import { FulfillmentInboundApiClient } from '@sp-api-sdk/fulfillment-inbound-api-2024-03-20';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const msku = (req.body?.msku || 'CN--ASHWAMACAF-VEG-BAG') as string;
  const marketplaceId = 'ATVPDKIKX0DER';

  try {
    const auth = new SellingPartnerApiAuth({
      clientId: process.env.AMAZON_CLIENT_ID!,
      clientSecret: process.env.AMAZON_CLIENT_SECRET!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
    });
    const client = new FulfillmentInboundApiClient({ auth, region: 'na' });

    // Step 1: List current prep details
    let listResult: any = null;
    try {
      const listRes = await client.listPrepDetails({
        marketplaceId,
        mskus: [msku],
      });
      listResult = listRes.data;
    } catch (listErr: any) {
      listResult = { error: listErr.message, status: listErr.response?.status, body: listErr.response?.data };
    }

    // Step 2: Set prep to NONE
    let setResult: any = null;
    try {
      const setRes = await client.setPrepDetails({
        body: {
          marketplaceId,
          mskuPrepDetails: [{
            msku,
            prepCategory: 'NONE' as any,
            prepTypes: [],
          }],
        },
      });
      setResult = setRes.data;
    } catch (setErr: any) {
      setResult = { error: setErr.message, status: setErr.response?.status, body: setErr.response?.data };
    }

    // Step 3: List again to verify
    let verifyResult: any = null;
    try {
      const verifyRes = await client.listPrepDetails({
        marketplaceId,
        mskus: [msku],
      });
      verifyResult = verifyRes.data;
    } catch (verifyErr: any) {
      verifyResult = { error: verifyErr.message, status: verifyErr.response?.status, body: verifyErr.response?.data };
    }

    return res.json({
      msku,
      step1_listPrepDetails: listResult,
      step2_setPrepDetails: setResult,
      step3_verifyPrepDetails: verifyResult,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
