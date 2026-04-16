import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

/**
 * Simple HTML dashboard for printing shipping labels.
 * Warehouse team bookmarks this page.
 * Shows today's generated labels with print buttons.
 * 
 * Auth: requires ?key=CRON_SECRET in URL
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.query.key as string;
  if (key !== process.env.CRON_SECRET) {
    return res.status(401).send('Unauthorized. Add ?key=YOUR_KEY to the URL.');
  }

  const ssApiKey = process.env.SHIPSTATION_API_KEY!;

  try {
    // Get recent successful labels
    const { data: labels, error } = await supabase
      .from('bridge_orders')
      .select('*')
      .eq('status', 'success')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = (labels || []).map((l: any) => `
      <tr>
        <td>${l.shiphero_order_number}</td>
        <td><code>${l.tracking_number || 'N/A'}</code></td>
        <td>${l.status}</td>
        <td>${new Date(l.updated_at).toLocaleString()}</td>
        <td>
          ${l.label_url
            ? `<a href="/api/labels/download?id=${l.id}&key=${key}" target="_blank" class="btn">📄 Print Label</a>`
            : 'No label'
          }
        </td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Clean Nutra - Shipping Labels</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 20px; }
    .stats { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { background: white; padding: 15px 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat h3 { font-size: 24px; color: #2563eb; }
    .stat p { color: #666; font-size: 14px; }
    table { width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #2563eb; color: white; padding: 12px; text-align: left; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f8fafc; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 6px 14px; border-radius: 4px; text-decoration: none; font-size: 14px; }
    .btn:hover { background: #1d4ed8; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    .refresh { float: right; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏷️ Clean Nutra - Shipping Labels <a href="?" class="btn refresh">↻ Refresh</a></h1>
    
    <div class="stats">
      <div class="stat">
        <h3>${labels?.length || 0}</h3>
        <p>Labels Ready</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Order #</th>
          <th>Tracking</th>
          <th>Status</th>
          <th>Generated</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="text-align:center;padding:40px;color:#999;">No labels generated yet</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error) {
    res.status(500).send(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}
