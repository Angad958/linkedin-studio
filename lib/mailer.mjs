import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { config, smtpReady } from './config.mjs';

let transport;
const DRY = process.env.MAIL_DRY_RUN === '1';

function getTransport() {
  // Dry-run: build the message but don't send it (used for testing the pipeline).
  if (DRY) return (transport ??= nodemailer.createTransport({ jsonTransport: true }));
  if (!smtpReady()) throw new Error('Gmail is not configured (GMAIL_USER / GMAIL_APP_PASSWORD in .env.local)');
  transport ??= nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: config.gmailUser, pass: config.gmailAppPassword },
  });
  return transport;
}

export async function sendMail({ to, subject, text, inReplyTo, attachResume = false }) {
  const attachments = [];
  if (attachResume && fs.existsSync(config.resumePath)) {
    attachments.push({ filename: 'Manav_Singh_SDE_Resume.pdf', path: config.resumePath });
  }
  const info = await getTransport().sendMail({
    from: { name: config.fromName, address: config.gmailUser },
    to, subject, text, attachments,
    ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}),
  });
  return info.messageId;
}

export async function sendToSelf(subject, text) {
  if (!smtpReady()) return false;
  await getTransport().sendMail({ from: config.gmailUser, to: config.gmailUser, subject, text });
  return true;
}

// Scan INBOX for messages since `since` (Date). Calls back with { from, subject, text } per message.
export async function scanInbox(since, onMessage) {
  if (DRY) return;
  if (!smtpReady()) throw new Error('Gmail is not configured');
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: config.gmailUser, pass: config.gmailAppPassword }, logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    for await (const msg of client.fetch({ since }, { envelope: true, source: { maxLength: 20000 } })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase() || '';
      await onMessage({ from, subject: msg.envelope?.subject || '', text: msg.source ? msg.source.toString('utf8') : '' });
    }
  } finally {
    lock.release();
    await client.logout();
  }
}
