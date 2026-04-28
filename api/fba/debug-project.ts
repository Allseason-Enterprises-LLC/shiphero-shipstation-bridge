import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.json({ 
    projectName: process.env.VERCEL_PROJECT_NAME,
    projectId: process.env.VERCEL_PROJECT_ID,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    env: process.env.VERCEL_ENV,
    repoSlug: process.env.VERCEL_GIT_REPO_SLUG,
  });
}
