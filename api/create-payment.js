/**
 * api/create-payment.js
 * Vercel serverless function — generates a signed PayFast payment payload.
 * Called by funnel.html before redirecting the user to PayFast checkout.
 *
 * ENV vars required (set in Vercel project settings):
 *   PAYFAST_MERCHANT_ID   — from PayFast dashboard → Settings → Merchant Details
 *   PAYFAST_MERCHANT_KEY  — from PayFast dashboard → Settings → Merchant Details
 *   PAYFAST_PASSPHRASE    — only if you set one in PayFast settings (optional)
 *   PAYFAST_SANDBOX       — "true" for sandbox testing, omit/false for live
 *   SITE_URL              — e.g. https://funnel.apexprotocols.co.za  (fallback: req.headers.host)
 */

import crypto from 'node:crypto';

export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, name, email } = req.body || {};

  if (!plan || !name || !email) {
    return res.status(400).json({ error: 'plan, name, and email are required' });
  }

  const merchantId  = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  const passphrase  = process.env.PAYFAST_PASSPHRASE || '';
  const isSandbox   = process.env.PAYFAST_SANDBOX === 'true';
  const siteUrl     = process.env.SITE_URL || `https://${req.headers.host}`;

  if (!merchantId || !merchantKey) {
    console.error('PayFast credentials not configured');
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  // ── PayFast endpoint ────────────────────────────────────────────────────────
  const payfastUrl = isSandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  // ── Split name ──────────────────────────────────────────────────────────────
  const [nameFirst, ...restParts] = name.trim().split(/\s+/);
  const nameLast = restParts.join(' ') || '';

  const isMonthly = plan === 'monthly';

  // ── Build fields (order matters for signature) ──────────────────────────────
  const fields = {
    merchant_id:   merchantId,
    merchant_key:  merchantKey,
    return_url:    `${siteUrl}/thank-you`,
    cancel_url:    `${siteUrl}/funnel`,
    notify_url:    `${siteUrl}/api/notify`,
    name_first:    nameFirst,
    name_last:     nameLast,
    email_address: email,
    m_payment_id:  `apex-${plan}-${Date.now()}`,
    amount:        isMonthly ? '1099.00' : '5500.00',
    item_name:     isMonthly ? 'Apex Protocol - Monthly' : 'Apex Protocol - 6 Months',
  };

  // Monthly plan uses PayFast subscriptions (frequency=3 means monthly)
  if (isMonthly) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    fields.subscription_type = '1';
    fields.billing_date      = today;
    fields.recurring_amount  = '1099.00';
    fields.frequency         = '3';  // 3 = monthly
    fields.cycles            = '0';  // 0 = indefinite
  }

  // ── Generate MD5 signature ──────────────────────────────────────────────────
  // Build param string: key=urlencoded_value&... (no signature field, add passphrase last)
  const paramParts = Object.entries(fields).map(
    ([k, v]) => `${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`
  );
  if (passphrase) {
    paramParts.push(`passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`);
  }
  const paramString = paramParts.join('&');
  fields.signature = crypto.createHash('md5').update(paramString).digest('hex');

  return res.status(200).json({ payfast_url: payfastUrl, fields });
}
