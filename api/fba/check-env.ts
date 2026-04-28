import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const amazonVars = Object.keys(process.env)
    .filter(k => k.includes('AMAZON') || k.includes('SP_API') || k.includes('LWA') || k.includes('REFRESH'))
    .map(k => `${k}=${process.env[k]?.substring(0, 10)}...`);
  
  res.json({ 
    found: amazonVars.length,
    vars: amazonVars,
    hasClientId: !!process.env.AMAZON_CLIENT_ID,
    hasClientSecret: !!process.env.AMAZON_CLIENT_SECRET,
    hasRefreshToken: !!process.env.AMAZON_REFRESH_TOKEN,
  });
}
