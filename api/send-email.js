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
    const { toEmail, clientName, amount, deadline, invoiceId, products, apiKey } = req.body || {};

    if (!toEmail) {
      return res.status(400).json({ error: 'Recipient Gmail is required' });
    }

    const subject = "pay me the bill";
    const textContent = `Hello ${clientName || 'Client'},\n\nThis is an official invoice notification regarding your pending bill (${invoiceId || 'INV-1034'}).\n\n- Products / Services Took: ${products || 'Consulting & Development'}\n- Bill Amount Due: $${Number(amount || 0).toLocaleString()}\n- Deadline to Pay Off: ${deadline || 'Immediate'}\n\nPlease settle this bill before the specified deadline.\n\nThank you,\nFlowLedger Autonomous Invoicing`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; border-bottom: 2px solid #10b981; padding-bottom: 12px;">Invoice Notification: ${subject}</h2>
        <p style="font-size: 15px; line-height: 1.6;">Hello <strong>${clientName || 'Client'}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6;">Here is your official invoice (<strong>${invoiceId || 'INV-1034'}</strong>) for your recent order.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Products / Services:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #0f172a; font-weight: 600;">${products || 'Consulting & Development'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Bill Amount Due:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #059669; font-size: 18px; font-weight: bold;">$${Number(amount || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;"><strong>Deadline to Pay Off:</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: bold;">${deadline || 'Immediate'}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; color: #475569; line-height: 1.5;">Please settle this bill amount before the specified deadline.</p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">Sent directly via FlowLedger Autonomous Invoicing</p>
      </div>
    `;

    // Try Resend API
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

      const resendData = await resendRes.json();

      if (resendRes.ok && !resendData.error) {
        return res.status(200).json({ success: true, provider: 'Resend', data: resendData });
      } else {
        // Return the actual Resend error so the UI can show it
        return res.status(400).json({
          success: false,
          provider: 'Resend',
          error: resendData.message || resendData.error || 'Resend rejected the request',
          detail: resendData
        });
      }
    }


    // Attempt 2: Brevo API if configured
    const BREVO_API_KEY = apiKey || process.env.BREVO_API_KEY;
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
