export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toEmail, clientName, amount, deadline, invoiceId } = req.body || {};

    if (!toEmail) {
      return res.status(400).json({ error: 'toEmail is required' });
    }

    const subject = "pay me the bill";
    const textContent = `Hello ${clientName || 'Client'},\n\nThis is a notification regarding your pending invoice (${invoiceId || 'INV'}).\n\n- Bill Amount Due: $${Number(amount || 0).toLocaleString()}\n- Deadline to Pay Off: ${deadline || 'Immediate'}\n\nPlease settle this bill before the specified deadline.\n\nThank you,\nFlowLedger Autonomous Receivables`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; border-bottom: 2px solid #22c55e; padding-bottom: 12px;">Payment Request: ${subject}</h2>
        <p style="font-size: 15px; line-height: 1.6;">Hello <strong>${clientName || 'Client'}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6;">This is an official automated notification regarding your pending invoice (<strong>${invoiceId || 'INV-1034'}</strong>).</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Bill Amount Due:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #15803d; font-size: 18px; font-weight: bold;">$${Number(amount || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Deadline to Pay Off:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #b91c1c; font-weight: bold;">${deadline || 'Immediate'}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; color: #475569; line-height: 1.5;">Please settle this bill before the specified deadline to avoid service disruption.</p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">Sent via FlowLedger Autonomous Receivables Platform</p>
      </div>
    `;

    // Attempt 1: Resend API if configured
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'FlowLedger <onboarding@resend.dev>',
          to: [toEmail],
          subject: subject,
          html: htmlContent,
          text: textContent
        })
      });

      if (resendRes.ok) {
        const data = await resendRes.json();
        return res.status(200).json({ success: true, provider: 'Resend', data });
      }
    }

    // Attempt 2: Brevo API if configured
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (BREVO_API_KEY) {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'FlowLedger Billing', email: 'billing@flowledger.ai' },
          to: [{ email: toEmail, name: clientName || 'Client' }],
          subject: subject,
          htmlContent: htmlContent,
          textContent: textContent
        })
      });

      if (brevoRes.ok) {
        const data = await brevoRes.json();
        return res.status(200).json({ success: true, provider: 'Brevo', data });
      }
    }

    return res.status(200).json({
      success: false,
      requiresConfig: true,
      message: 'No backend API key configured. Provide RESEND_API_KEY in Vercel settings.'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
