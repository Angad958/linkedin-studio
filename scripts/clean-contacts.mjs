// Import + clean an HR outreach CSV (Email, Name, Company, Source Sheet) into the contacts table.
// Usage: node scripts/clean-contacts.mjs <file.csv> [--no-mx]
import dns from 'node:dns/promises';
import fs from 'node:fs';
import { getDb, nowLocal } from '../lib/db.mjs';
import { finishJob, jobLog, startJob } from '../lib/jobs.mjs';

const file = process.argv[2];
const skipMx = process.argv.includes('--no-mx');
if (!file) { console.error('usage: clean-contacts.mjs <file.csv>'); process.exit(1); }

const EMAIL_RE = /[a-z0-9][a-z0-9._%+'-]*@(?:[a-z0-9-]+\.)+[a-z]{2,24}/gi;
const PERSONAL = new Set(['gmail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'rediffmail.com', 'hotmail.com', 'outlook.com',
  'live.com', 'ymail.com', 'icloud.com', 'aol.com', 'msn.com', 'rocketmail.com', 'googlemail.com', 'protonmail.com', 'zoho.com']);
const GENERIC_RE = /^(hr|hrd|hrm|hrteam|career|careers|jobs?|recruit\w*|talent\w*|hiring|campus\w*|freshers?|info|admin|resumes?|cv|apply|contact|hello|people|placements?|opportunit\w*|humanresources?|staffing|vacanc\w*)([._-]?[a-z0-9]*)?$/i;
const BLOCK_RE = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|unsubscribe|bounce\w*|test|example)/i;
const EXCLUDE_DOMAINS = ['rippling.com', 'example.com', 'domain.com', 'email.com'];
// Product/tech companies that hire for backend / SDE-2 / AI roles. Matched against the email's registrable domain label.
const PRODUCT = new Set(`amazon google microsoft flipkart myntra cred zomato swiggy paytm phonepe razorpay uber olacabs ola atlassian adobe
 salesforce oracle walmart walmartlabs linkedin intuit sprinklr freshworks zoho postman browserstack groww zerodha upstox dream11 sharechat
 inmobi nykaa lenskart urbancompany cars24 oyorooms oyo makemytrip goibibo bigbasket zeptonow zepto blinkit grofers dunzo unacademy byjus
 vedantu practo policybazaar cleartax chargebee druva hasura juspay cashfree sliceit jupiter navi atherenergy rapido porter delhivery
 shiprocket ixigo snapdeal indiamart naukri infoedge nvidia intel qualcomm samsung cisco vmware netflix apple meta facebook goldmansachs gs
 jpmorgan jpmchase morganstanley deshaw tower sap servicenow visa mastercard aexp americanexpress paypal stripe airbnb booking expedia
 thoughtworks nutanix rubrik cohesity confluent databricks snowflake twilio gojek grab tekion mindtickle innovaccer whatfix darwinbox
 spinny acko digit coinswitch coindcx khatabook okcredit pinelabs mobikwik billdesk payu zeta ninjacart udaan jar fampay
 games24x7 mpl winzo glance dailyhunt verse moengage clevertap webengage leadsquared capillary hackerrank hackerearth scaler
 linkedin uber lyft doordash instacart rippling deel gojek bytedance tiktok mercari rakuten agoda`.split(/\s+/).filter(Boolean));

function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const label = (domain) => {
  const parts = domain.split('.');
  const sld = ['co', 'com', 'net', 'org', 'ac', 'gov'].includes(parts.at(-2)) && parts.length > 2 ? parts.at(-3) : parts.at(-2);
  return sld || domain;
};
const titleCase = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function guessName(local) {
  const m = local.match(/^([a-z]{3,})[._-][a-z]/i);
  return m ? titleCase(m[1].toLowerCase()) : '';
}

async function hasMx(domain, cache) {
  if (PERSONAL.has(domain)) return true;
  if (cache.has(domain)) return cache.get(domain);
  let ok;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.length > 0;
  } catch (e) {
    ok = e.code === 'ENODATA' || e.code === 'ENOTFOUND' ? false : null; // null = transient, don't penalise
    if (ok === false) {
      try { ok = (await dns.resolve4(domain)).length > 0 ? null : false; } catch { /* stays false */ }
    }
  }
  cache.set(domain, ok);
  return ok;
}

const job = startJob('import-contacts', file);
const db = getDb();
try {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (n) => header.findIndex((h) => h.includes(n));
  const iE = col('email'); const iN = col('name'); const iC = col('company'); const iS = col('source');
  jobLog(job, `${rows.length} rows, columns: ${header.join(', ')}`);

  // 1. Extract every valid address (cells sometimes contain many glued together).
  const byEmail = new Map();
  let junkCells = 0;
  for (const r of rows) {
    const rawEmail = r[iE] || '';
    const rawCompany = (r[iC] || '').trim();
    const found = [...new Set((`${rawEmail}`.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))];
    const companyHasEmails = /@/.test(rawCompany);
    if (found.length !== 1 || companyHasEmails) junkCells++;
    const extra = companyHasEmails ? (rawCompany.match(EMAIL_RE) || []).map((e) => e.toLowerCase()) : [];
    for (const email of [...found, ...extra]) {
      if (byEmail.has(email)) continue;
      const single = found.length === 1 && !extra.includes(email);
      byEmail.set(email, {
        email,
        name: single ? (r[iN] || '').trim() : '',
        company: single && !companyHasEmails ? rawCompany : '',
        source: (r[iS] || '').trim(),
      });
    }
  }
  jobLog(job, `${byEmail.size} unique addresses extracted (${junkCells} messy cells split)`);

  // 2. MX lookups, 40 at a time.
  const cache = new Map(db.prepare('SELECT domain, has_mx FROM domains').all().map((d) => [d.domain, d.has_mx === null ? null : Boolean(d.has_mx)]));
  const domains = [...new Set([...byEmail.keys()].map((e) => e.split('@')[1]))];
  if (!skipMx) {
    const todo = domains.filter((d) => !cache.has(d) && !PERSONAL.has(d));
    jobLog(job, `checking MX for ${todo.length} domains…`);
    const saveDomain = db.prepare('INSERT OR REPLACE INTO domains(domain, has_mx, checked_at) VALUES(?, ?, ?)');
    for (let i = 0; i < todo.length; i += 40) {
      await Promise.all(todo.slice(i, i + 40).map(async (d) => {
        const ok = await hasMx(d, cache);
        saveDomain.run(d, ok === null ? null : Number(ok), nowLocal());
      }));
      if (i % 800 === 0) jobLog(job, `  ${Math.min(i + 40, todo.length)}/${todo.length}`);
    }
  }

  // 3. Classify, score, tier.
  const upsert = db.prepare(`INSERT INTO contacts(email, name, company, domain, source, kind, score, tier, excluded_reason)
    VALUES(@email, @name, @company, @domain, @source, @kind, @score, @tier, @excluded_reason)
    ON CONFLICT(email) DO UPDATE SET name=COALESCE(NULLIF(contacts.name,''), excluded.name), company=COALESCE(NULLIF(contacts.company,''), excluded.company),
      source=excluded.source, kind=excluded.kind, score=excluded.score,
      tier=CASE WHEN contacts.status IN ('new','queued') THEN excluded.tier ELSE contacts.tier END,
      excluded_reason=excluded.excluded_reason, updated_at=datetime('now','localtime')`);
  const stats = { A: 0, B: 0, C: 0, X: 0 };
  const reasons = {};
  db.transaction(() => {
    for (const c of byEmail.values()) {
      const [local, domain] = c.email.split('@');
      const lbl = label(domain);
      const personal = PERSONAL.has(domain);
      const agency = /agenc|consult/i.test(c.source);
      const kind = personal ? 'personal' : agency ? 'agency' : GENERIC_RE.test(local) ? 'generic' : 'named';
      let company = c.company;
      if (!company || company.length > 60 || /not mentioned|^n\/?a$|\.(com|in|co|net|org)\b/i.test(company)) company = personal ? '' : titleCase(lbl);
      const name = c.name && c.name.length < 60 && !/@/.test(c.name) ? c.name : (kind === 'named' || personal ? guessName(local) : '');
      const mx = skipMx ? true : cache.get(domain) ?? (PERSONAL.has(domain) ? true : null);

      let excluded = null;
      if (BLOCK_RE.test(local)) excluded = 'system/no-reply address';
      else if (EXCLUDE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) excluded = 'current employer / placeholder';
      else if (mx === false) excluded = 'domain has no mail server (dead)';
      else if (local.length > 40 || /\.\./.test(c.email)) excluded = 'malformed';

      let score = 0;
      if (/^my list$/i.test(c.source)) score += 40;
      else if (/new emails/i.test(c.source)) score += 25;
      else if (/hr head|top corporates/i.test(c.source)) score += 10;
      if (kind === 'named') score += 20;
      if (kind === 'personal') score -= 10;
      if (kind === 'agency') score -= 15;
      if (PRODUCT.has(lbl.toLowerCase()) || PRODUCT.has(company.toLowerCase().replace(/\s+/g, ''))) score += 30;
      if (name) score += 5;
      const tier = excluded ? 'X' : score >= 55 ? 'A' : score >= 25 ? 'B' : 'C';
      stats[tier]++;
      if (excluded) reasons[excluded] = (reasons[excluded] || 0) + 1;
      upsert.run({ email: c.email, name, company, domain, source: c.source, kind, score, tier, excluded_reason: excluded });
    }
  })();
  const summary = `tiers: A=${stats.A} B=${stats.B} C=${stats.C} excluded=${stats.X} ${JSON.stringify(reasons)}`;
  jobLog(job, summary);
  finishJob(job, true, summary);
  console.log(summary);
  process.exit(0);
} catch (e) {
  jobLog(job, e.stack);
  finishJob(job, false, e.message);
  console.error(e);
  process.exit(1);
}
