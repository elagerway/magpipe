/**
 * Edge Function: send-custom-plan-inquiry
 * Sends custom plan inquiry form submissions to sales team via Postmark
 */

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  try {
    const {
      firstName,
      lastName,
      email,
      companyName,
      companySize,
      monthlyVolume,
      concurrentCalls,
      useCase,
      hearAbout
    } = await req.json()

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!

    // Build email content
    const subject = `Custom Plan Inquiry: ${firstName} ${lastName}${companyName ? ` - ${companyName}` : ''}`

    const htmlBody = `
      <h2>New Custom Plan Inquiry</h2>

      <h3>Contact Information</h3>
      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 180px;">Name</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${firstName} ${lastName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td>
          <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${email}">${email}</a></td>
        </tr>
        ${companyName ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Company</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${companyName}</td>
        </tr>
        ` : ''}
        ${companySize ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Company Size</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${companySize}</td>
        </tr>
        ` : ''}
      </table>

      <h3>Requirements</h3>
      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        ${monthlyVolume ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 180px;">Monthly Call Volume</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${monthlyVolume}</td>
        </tr>
        ` : ''}
        ${concurrentCalls ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Concurrent Calls</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${concurrentCalls}</td>
        </tr>
        ` : ''}
        ${hearAbout ? `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">How they heard about us</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${hearAbout}</td>
        </tr>
        ` : ''}
      </table>

      ${useCase ? `
      <h3>Use Case</h3>
      <div style="padding: 12px; background: #f5f5f5; border-radius: 4px; white-space: pre-wrap;">${useCase}</div>
      ` : ''}

      <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #666; font-size: 12px;">
        Submitted at: ${new Date().toISOString()}<br>
        Reply directly to this email to respond to the inquiry.
      </p>
    `

    const textBody = `
New Custom Plan Inquiry

CONTACT INFORMATION
Name: ${firstName} ${lastName}
Email: ${email}
${companyName ? `Company: ${companyName}` : ''}
${companySize ? `Company Size: ${companySize}` : ''}

REQUIREMENTS
${monthlyVolume ? `Monthly Call Volume: ${monthlyVolume}` : ''}
${concurrentCalls ? `Concurrent Calls: ${concurrentCalls}` : ''}
${hearAbout ? `How they heard about us: ${hearAbout}` : ''}

${useCase ? `USE CASE\n${useCase}` : ''}

---
Submitted at: ${new Date().toISOString()}
Reply directly to this email to respond to the inquiry.
    `.trim()

    // Send email via Postmark
    const emailResponse = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: 'notifications@snapsonic.com',
        To: 'custompackage@snapsonic.com',
        ReplyTo: email,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound'
      })
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Postmark error:', emailResult)
      throw new Error(`Postmark API error: ${emailResult.Message || 'Unknown error'}`)
    }

    console.log('Custom plan inquiry sent successfully:', emailResult.MessageID)

    return new Response(JSON.stringify({
      success: true,
      messageId: emailResult.MessageID
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Error in send-custom-plan-inquiry:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})
