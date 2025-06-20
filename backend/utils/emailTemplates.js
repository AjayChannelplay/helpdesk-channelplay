// /Users/ajaykumar/Desktop/helpdesk-channelplay/helpdesk-channelplay/backend/utils/emailTemplates.js

/**
 * Generates the HTML content for a customer feedback email.
 * @param {string} customerName - The name of the customer.
 * @param {string} feedbackToken - The unique feedback token.
 * @param {string} ticketDisplayId - The user-facing ticket ID (e.g., user_ticket_id).
 * @param {string} baseFeedbackUrl - The base URL for the feedback submission endpoint.
 * @returns {string} The HTML string for the email.
 */
function generateFeedbackEmailHTML(customerName, feedbackToken, ticketDisplayIdForText, ticketIdForLink, baseFeedbackUrl) {
  let ratingSquaresHTML = '';
  for (let i = 1; i <= 10; i++) {
    const feedbackLink = `${baseFeedbackUrl}?token=${feedbackToken}&rating=${i}&ticket_id=${ticketIdForLink}`;
    ratingSquaresHTML += `
      <a href="${feedbackLink}" target="_blank" class="rating-square" style="display: inline-block; width: 32px; height: 32px; line-height: 32px; text-align: center; background-color: #e0e0e0; color: #333333; text-decoration: none; margin: 0 2px; font-weight: bold; font-size: 14px; border-radius: 0;">${i}</a>
    `;
  }

  const emailHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Feedback Request</title>
      <style>
        .rating-square:hover {
          background-color: #c5c5c5 !important;
          color: #000000 !important;
        }
      </style>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; margin: 0; padding: 0; background-color: #f8f9fa;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa;">
        <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; padding: 30px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <tr>
                <td align="center">
                  <p style="font-size: 22px; color: #343a40; margin-bottom: 10px; margin-top: 0;">Hi ${customerName || 'Valued Customer'},</p>
                  <p style="font-size: 16px; color: #495057; margin-bottom: 25px; line-height: 1.5;">
                    Thank you for contacting us! We'd love to hear about your recent experience with our support for ticket #${ticketDisplayIdForText}.
                    <br><br>
                    <strong style="font-size: 16px;">Please rate your experience:</strong>
                  </p>
                  <div style="margin-bottom: 10px; font-size: 0;">
                    ${ratingSquaresHTML}
                  </div>
                  <table width="360" align="center" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 25px;">
                    <tr>
                      <td align="left" style="font-size: 12px; color: #6c757d;">Strongly Dissatisfied</td>
                      <td align="right" style="font-size: 12px; color: #6c757d;">Strongly Satisfied</td>
                    </tr>
                  </table>
                  <p style="font-size: 14px; color: #6c757d; margin-top: 20px;">
                    Your feedback is important to us and helps us improve.
                    <br>
                    Thank you for your time! Achaa tow ab kab milogi
                  </p>
                   <p style="font-size: 12px; color: #6c757d; margin-top: 20px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                    If you feel your issue was not resolved, please reply directly to this email to reopen your ticket.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  return emailHTML;
}

/**
 * Generates the HTML content for a new ticket acknowledgment email.
 * @param {string} customerName - The name of the customer.
 * @param {string} ticketDisplayId - The user-facing ticket ID.
 * @param {string} deskName - The name of the helpdesk.
 * @returns {string} The HTML string for the email.
 */
function generateNewTicketAckEmailHTML(customerName, ticketDisplayId, deskName) {
  const name = customerName || 'Valued Customer';
  const displayTicketIdText = ticketDisplayId ? `#${ticketDisplayId}` : 'N/A';
  const plainDeskName = deskName || 'Support'; // Use plain desk name

  const emailHTML = `
Dear ${name},<br><br>
Thank you for contacting ${plainDeskName}. We have successfully received your request and created support ticket <b>${displayTicketIdText}</b> for you.<br><br>
${plainDeskName} team will review your request shortly.<br><br>
Important Information:<br>
Please keep this ticket ID <b>${displayTicketIdText}</b> for future reference<br>
Reply to this email to add any additional information to your ticket<br><br>
Thanks & Regards,<br>
${plainDeskName}
  `;
  return emailHTML;
}

module.exports = {
  generateFeedbackEmailHTML,
  generateNewTicketAckEmailHTML,
};
