import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SellingPartnerApiAuth } from '@sp-api-sdk/auth';
import axios from 'axios';

export const config = { maxDuration: 60 };

/**
 * Fetch FBA shipping labels for a shipment.
 * GET /api/fba/get-labels?shipmentId=FBA19CBZ0CPX&pageType=PackageLabel_Thermal
 * 
 * Uses Amazon v0 Fulfillment Inbound API (getLabels).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shipmentId = (req.query.shipmentId || req.body?.shipmentId) as string;
  const pageType = (req.query.pageType || req.body?.pageType || 'PackageLabel_Thermal') as string;

  if (!shipmentId) {
    return res.status(400).json({ error: 'Missing shipmentId' });
  }

  try {
    const auth = new SellingPartnerApiAuth({
      clientId: process.env.AMAZON_CLIENT_ID!,
      clientSecret: process.env.AMAZON_CLIENT_SECRET!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
    });

    const token = await auth.getAccessToken();

    // Use v0 Fulfillment Inbound API for labels
    const url = `https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/${shipmentId}/labels`;
    const params: Record<string, string> = {
      PageType: pageType,
      LabelType: 'UNIQUE',
    };

    console.log(`[get-labels] Fetching labels for ${shipmentId}, pageType=${pageType}`);

    const response = await axios.get(url, {
      headers: {
        'x-amz-access-token': token,
        'Content-Type': 'application/json',
      },
      params,
    });

    const downloadUrl = response.data?.payload?.DownloadURL;
    console.log(`[get-labels] Got download URL: ${downloadUrl ? 'yes' : 'no'}`);

    return res.json({
      success: true,
      shipmentId,
      downloadUrl,
      raw: response.data,
    });
  } catch (err: any) {
    const errData = err.response?.data || err.message;
    console.error('[get-labels] Error:', JSON.stringify(errData));
    return res.status(500).json({
      success: false,
      error: err.message,
      details: errData,
    });
  }
}
