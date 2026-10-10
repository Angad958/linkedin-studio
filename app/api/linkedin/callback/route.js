import { config } from '@/lib/config.mjs';
import { kvGet, kvSet } from '@/lib/db.mjs';
import { exchangeCode, me, saveAuth } from '@/lib/linkedin.mjs';

export const dynamic = 'force-dynamic';

const back = (q) => Response.redirect(`${config.baseUrl}/settings?${new URLSearchParams(q)}`);

export async function GET(req) {
  const u = new URL(req.url);
  const saved = kvGet('linkedin_oauth_state');
  kvSet('linkedin_oauth_state', null);
  if (u.searchParams.get('error')) return back({ linkedin: 'error', msg: u.searchParams.get('error_description') || u.searchParams.get('error') });
  if (!saved || saved.state !== u.searchParams.get('state') || Date.now() - saved.at > 10 * 60000) {
    return back({ linkedin: 'error', msg: 'Sign-in link expired. Click Connect again.' });
  }
  try {
    const t = await exchangeCode(u.searchParams.get('code'));
    const p = await me(t.access_token);
    saveAuth({ token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000, personUrn: `urn:li:person:${p.sub}`, name: p.name });
    return back({ linkedin: 'connected' });
  } catch (e) {
    return back({ linkedin: 'error', msg: e.message });
  }
}
