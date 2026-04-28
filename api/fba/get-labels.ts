import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SellingPartnerApiAuth } from '@sp-api-sdk/auth';
import axios from 'axios';

export const config = { maxDuration: 60 };

/**
 * Fetch FBA shipping labels.
 * GET /api/fba/get-labels?shipmentId=FBA19CBZ0CPX&boxIds=FBA19CBZ0CPXU000001&pageType=PackageLabel_Thermal
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const shipmentId = (req.query.shipmentId || req.body?.shipmentId) as string;
  const pageType = (req.query.pageType || req.body?.pageType || 'PackageLabel_Thermal') as string;
  const boxIdsParam = req.query.boxIds 
    ? (Array.isArray(req.query.boxIds) ? req.query.boxIds : (req.query.boxIds as string).split(','))
    : req.body?.boxIds || [];

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

    // v0 FBA Inbound getLabels API
    const url = `https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/${shipmentId}/labels`;
    
    // Build query params
    const params = new URLSearchParams();
    params.set('PageType', pageType);
    params.set('LabelType', 'UNIQUE');
    params.set('NumberOfPackages', String(boxIdsParam.length || 1));
    
    // PackageLabelsToPrint needs to be repeated for each box ID
    for (const boxId of boxIdsParam) {
      params.append('PackageLabelsToPrint', boxId);
    }

    console.log(`[get-labels] Fetching labels: ${url}?${params.toString()}`);

    const response = await axios.get(`${url}?${params.toString()}`, {
      headers: {
        'x-amz-access-token': token,
        'Content-Type': 'application/json',
      },
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
