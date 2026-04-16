import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

/**
 * Proxy label PDF download from ShipStation.
 * ShipStation label URLs require the API key header,
 * so this endpoint acts as a proxy for the warehouse.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.query.key as string;
  if (key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const orderId = req.query.id as string;
  if (!orderId) {
    return res.status(400).json({ error: 'Missing ?id= parameter' });
  }

  try {
    const { data, error } = await supabase
      .from('bridge_orders')
      .select('label_url, shiphero_order_number')
      .eq('id', orderId)
      .single();

    if (error || !data?.label_url) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Fetch the label PDF from ShipStation
    const labelRes = await fetch(data.label_url, {
      headers: {
        'api-key': process.env.SHIPSTATION_API_KEY!,
      },
    });

    if (!labelRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch label from ShipStation' });
    }

    const buffer = await labelRes.arrayBuffer();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="label-${data.shiphero_order_number}.pdf"`);
    res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
