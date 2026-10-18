import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.STUDIO_DATA_DIR || path.join(ROOT, 'data');
export const DRAFTS_DIR = path.join(ROOT, 'drafts');
export const LI_DIR = path.join(os.homedir(), '.claude', 'linkedin');
export const HUMAN_DIR = path.join(os.homedir(), '.claude', 'skills', 'li-human');
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Minimal .env.local loader so scripts run under launchd see the same config as Next.js.
function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  handle: process.env.LINKEDIN_HANDLE || '',
  gmailUser: process.env.GMAIL_USER || '',
  gmailAppPassword: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
  fromName: process.env.FROM_NAME || '',
  resumePath: process.env.RESUME_PATH || path.join(DATA_DIR, 'resume.pdf'),
  newPerDay: num(process.env.OUTREACH_NEW_PER_DAY, 20),
  totalCapPerDay: num(process.env.OUTREACH_TOTAL_CAP, 45),
  minGapMin: num(process.env.SEND_MIN_GAP_MIN, 2),
  maxGapMin: num(process.env.SEND_MAX_GAP_MIN, 5),
  sendWindow: [num(process.env.SEND_WINDOW_START, 9.5), num(process.env.SEND_WINDOW_END, 18)],
  maxBounceRate: num(process.env.MAX_BOUNCE_RATE, 0.03),
  claudeBin: process.env.CLAUDE_BIN || path.join(os.homedir(), '.local', 'bin', 'claude'),
  targetRoles: process.env.TARGET_ROLES || 'SDE-2 / Backend Engineer / AI Engineer',
  phone: process.env.CONTACT_PHONE || '',
  careerStart: process.env.CAREER_START || '',
  launchdPrefix: 'com.linkedin-studio',
  autoPost: process.env.AUTO_POST !== '0',
  autoPostUntil: num(process.env.AUTO_POST_UNTIL, 18),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  liClientId: process.env.LINKEDIN_CLIENT_ID || '',
  liClientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  liApiVersion: process.env.LINKEDIN_API_VERSION || '202609',
};

export const smtpReady = () => process.env.MAIL_DRY_RUN === '1' || Boolean(config.gmailUser && config.gmailAppPassword);
