/**
 * api/notify.js
 * Vercel serverless function — PayFast Instant Transfer Notification (ITN) handler.
 * PayFast POSTs to this endpoint after every payment event.
 * On COMPLETE payment: verifies the signature, then sends the program access email via Resend.
 *
 * ENV vars required:
 *   PAYFAST_PASSPHRASE  — must match what's in PayFast settings (optional, but use it)
 *   APEX_PROGRAM_URL    — the private program link to email paying customers
 *   RESEND_API_KEY      — Resend API key for sending email
 */

import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const pfData = req.body || {};

  // ── Only act on completed payments ──────────────────────────────────────────
  if (pfData.payment_status !== 'COMPLETE') {
    console.log(`PayFast ITN received — status: ${pfData.payment_status} (no action)`);
    return res.status(200).end();
  }

  // ── Verify signature ────────────────────────────────────────────────────────
  const passphrase          = process.env.PAYFAST_PASSPHRASE || '';
  const { signature: receivedSig, ...dataWithoutSig } = pfData;

  const paramParts = Object.entries(dataWithoutSig).map(
    ([k, v]) => `${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`
  );
  if (passphrase) {
    paramParts.push(`passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`);
  }
  const expectedSig = crypto.createHash('md5').update(paramParts.join('&')).digest('hex');

  if (receivedSig !== expectedSig) {
    console.error('PayFast ITN: signature mismatch — possible spoofed request');
    return res.status(400).end();
  }

  // ── Send welcome email ──────────────────────────────────────────────────────
  const email      = pfData.email_address;
  const name       = `${pfData.name_first || ''} ${pfData.name_last || ''}`.trim();
  const plan       = pfData.item_name || '';
  const grossAmt   = pfData.amount_gross || '';
  const programUrl = process.env.APEX_PROGRAM_URL;
  const resendKey  = process.env.RESEND_API_KEY;

  if (!email || !programUrl || !resendKey) {
    console.error('PayFast ITN: missing email, APEX_PROGRAM_URL, or RESEND_API_KEY');
    return res.status(200).end(); // acknowledge PayFast even if email fails
  }

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Apex Protocol <admin@samsaracommunity.org>',
        to:      [email],
        subject: "You're in — Welcome to Apex Protocol 🔥",
        html:    buildWelcomeEmail(name, programUrl, plan, grossAmt),
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Resend error:', errText);
    } else {
      console.log(`Welcome email sent to ${email} for plan: ${plan}`);
    }
  } catch (err) {
    console.error('Email send failed:', err);
  }

  // ── Log to Supabase members table ─────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // service role — bypasses RLS for server-side inserts

  if (supabaseUrl && supabaseKey) {
    try {
      // Parse plan from m_payment_id (format: apex-monthly-timestamp or apex-sixmonths-timestamp)
      const planSlug = (pfData.m_payment_id || '').split('-')[1] || 'unknown';

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/members`, {
        method: 'POST',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          name,
          email,
          plan:          planSlug,
          payfast_id:    pfData.m_payment_id || null,
          amount_gross:  parseFloat(pfData.amount_gross) || 0,
          status:        'active',
        }),
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        console.error('Supabase insert error:', errText);
      } else {
        console.log(`Member logged to Supabase: ${email} (${planSlug})`);
      }
    } catch (err) {
      console.error('Supabase insert failed:', err);
    }
  }

  // Always respond 200 to PayFast so they don't retry
  return res.status(200).end();
}

// ── Email template ────────────────────────────────────────────────────────────
function buildWelcomeEmail(name, programUrl, plan, amount) {
  const firstName = name.split(' ')[0] || 'there';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0e0e0e;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#1a1a1a;border-radius:8px;overflow:hidden;">

    <!-- Header -->
    <div style="padding:40px 32px 32px;text-align:center;border-bottom:2px solid #cc2222;background:radial-gradient(circle at 50% 0%,rgba(204,34,34,0.15) 0%,transparent 70%);">
      <p style="margin:0 0 10px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#cc2222;font-weight:700;">
        Apex Protocol
      </p>
      <h1 style="margin:0;font-size:30px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:1px;">
        You're In, ${firstName} 🔥
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#c0c0c0;">
        Your payment went through. Welcome to Apex Protocol — you made a real decision today.
      </p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#c0c0c0;">
        Here's your program access link. Bookmark it — this is how you get in:
      </p>

      <!-- CTA button -->
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${programUrl}"
           style="display:inline-block;background:#cc2222;color:#ffffff;text-decoration:none;padding:16px 44px;border-radius:6px;font-weight:700;font-size:16px;text-transform:uppercase;letter-spacing:1px;">
          Access Apex Protocol →
        </a>
      </div>

      <!-- Plan details -->
      <div style="background:#141414;border:1px solid #2a2a2a;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;">Payment confirmed</p>
        <p style="margin:0;font-size:14px;color:#c0c0c0;">${plan}${amount ? ` — R${parseFloat(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : ''}</p>
      </div>

      <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
        Keep this email safe — your access link lives here.<br>
        Questions? Reply directly to this email and we'll sort you out.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #2a2a2a;text-align:center;">
      <p style="margin:0;font-size:11px;color:#444;">
        © Apex Protocol. You're receiving this because you just joined the program.
      </p>
    </div>

  </div>
</body>
</html>`;
}
