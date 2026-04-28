import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SellingPartnerApiAuth } from '@sp-api-sdk/auth';
import { FulfillmentInboundApiClient } from '@sp-api-sdk/fulfillment-inbound-api-2024-03-20';
import axios from 'axios';

export const config = { maxDuration: 60 };

/**
 * Download FNSKU barcode labels from Amazon for product units.
 * 
 * POST /api/fba/fnsku-labels
 * {
 *   "msku": "CN-CAP-METHYLATEDB-60BG",
 *   "quantity": 2000,
 *   "labelType": "THERMAL_PRINTING"  // or "STANDARD_FORMAT" for letter paper
 * }
 * 
 * Returns a download URL for the FNSKU label PDF.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { msku, quantity = 1, labelType = 'THERMAL_PRINTING' } = req.body || {};

  if (!msku) return res.status(400).json({ error: 'Missing msku' });

  try {
    const auth = new SellingPartnerApiAuth({
      clientId: process.env.AMAZON_CLIENT_ID!,
      clientSecret: process.env.AMAZON_CLIENT_SECRET!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
    });

    const client = new FulfillmentInboundApiClient({ auth, region: 'na' });

    console.log(`[fnsku-labels] Requesting FNSKU labels for ${msku}, qty=${quantity}, type=${labelType}`);

    const bodyParams: any = {
      marketplaceId: 'ATVPDKIKX0DER',
      labelType: labelType as any,
      mskuQuantities: [{ msku, quantity: Number(quantity) }],
    };

    // Thermal printing requires width/height (in inches)
    if (labelType === 'THERMAL_PRINTING') {
      bodyParams.width = req.body?.width || 3.5;  // Standard FNSKU label
      bodyParams.height = req.body?.height || 1.125;
      bodyParams.pageType = req.body?.pageType || undefined;
    }

    const result = await client.createMarketplaceItemLabels({
      body: bodyParams,
    });

    const downloads = (result.data as any)?.documentDownloads || [];
    console.log(`[fnsku-labels] Got ${downloads.length} download(s)`);

    if (downloads.length === 0) {
      return res.json({ success: false, error: 'No download URL returned' });
    }

    // Download URL might be a direct URL or need to be fetched
    const downloadUrl = downloads[0]?.downloadUrl || downloads[0]?.url;

    return res.json({
      success: true,
      msku,
      quantity,
      downloadUrl,
      downloads,
    });
  } catch (err: any) {
    const errData = err.response?.data || err.message;
    console.error('[fnsku-labels] Error:', JSON.stringify(errData));
    return res.status(500).json({
      success: false,
      error: err.message,
      details: errData,
    });
  }
}
