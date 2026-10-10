import crypto from 'node:crypto';
import { config } from '@/lib/config.mjs';
import { kvSet } from '@/lib/db.mjs';
import { authUrl, linkedinConfigured } from '@/lib/linkedin.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!linkedinConfigured()) {
    return Response.redirect(`${config.baseUrl}/settings?linkedin=error&msg=${encodeURIComponent('Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env.local and restart')}`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  kvSet('linkedin_oauth_state', { state, at: Date.now() });
  return Response.redirect(authUrl(state));
}
