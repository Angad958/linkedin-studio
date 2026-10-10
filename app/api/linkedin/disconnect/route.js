import { config } from '@/lib/config.mjs';
import { clearAuth } from '@/lib/linkedin.mjs';

export async function POST() {
  clearAuth();
  return Response.redirect(`${config.baseUrl}/settings?linkedin=disconnected`, 303);
}
