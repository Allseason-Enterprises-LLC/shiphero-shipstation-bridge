import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allKeys = Object.keys(process.env).sort();
  res.json({ 
    total: allKeys.length,
    keys: allKeys,
  });
}
