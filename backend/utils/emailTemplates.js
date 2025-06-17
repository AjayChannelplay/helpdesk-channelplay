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
  // Define color gradient from red to green
  const colorGradient = [
    '#FF0000', // Dark red
    '#FF3333', // Red
    '#FF6666', // Light red
    '#FF9966', // Red-orange
    '#FFCC66', // Orange
    '#FFDD55', // Yellow-orange
    '#DDDD44', // Yellow
    '#99CC44', // Yellow-green
    '#66CC44', // Light green
    '#00CC00'  // Green
  ];
  
  let ratingButtonsHTML = '';
  for (let i = 1; i <= 10; i++) {
    const feedbackLink = `${baseFeedbackUrl}?token=${feedbackToken}&rating=${i}&ticket_id=${ticketIdForLink}`;
    // Using data-hover attributes that will be styling hooks for some email clients
    // Note: Hover effects don't work in most email clients, so providing both hover and static options
    ratingButtonsHTML += `
      <a href="${feedbackLink}" target="_blank" style="display: inline-block; width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 0; background-color: #FFFFFF; color: #333333; text-decoration: none; margin: 0 4px; font-weight: bold; font-size: 14px; border: 1px solid #d0d0d0;" onmouseover="this.style.backgroundColor='${colorGradient[i-1]}'; this.style.color='#FFFFFF';" onmouseout="this.style.backgroundColor='#FFFFFF'; this.style.color='#333333';">${i}</a>
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
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
          margin: 0;
          padding: 0;
          background-color: #f8f9fa;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border-radius: 8px;
          padding: 30px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
          font-size: 22px;
          color: #343a40;
          margin-bottom: 10px;
        }
        .sub-header {
          font-size: 16px;
          color: #495057;
          margin-bottom: 25px;
          line-height: 1.5;
        }
        .rating-buttons {
          margin-bottom: 30px;
        }
        .footer-text {
          font-size: 14px;
          color: #6c757d;
          margin-top: 20px;
        }
        .logo {
          max-width: 150px;
          margin-bottom: 20px;
        }
        @media screen and (max-width: 600px) {
          .container {
            margin: 10px;
            padding: 20px;
          }
          .rating-buttons a {
            width: 28px;
            height: 28px;
            line-height: 28px;
            font-size: 13px;
            margin: 0 2px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Optional: <img src="YOUR_LOGO_URL" alt="Company Logo" class="logo"> -->
        <p class="header">Hi ${customerName || 'Valued Customer'},</p>
        <p class="sub-header">
          Thank you for contacting us! We'd love to hear about your recent experience with our support for ticket #${ticketDisplayIdForText}.
          <br><br>
          <strong>Please rate your experience:</strong>
        </p>
        <div class="rating-buttons">
          ${ratingButtonsHTML}
        </div>
        <table style="width: 100%; margin: 5px 0 20px; border-collapse: collapse;" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" align="left" style="padding: 0;">
              <span style="font-size: 13px; color: #666;">Very Dissatisfied</span>
            </td>
            <td width="50%" align="right" style="padding: 0;">
              <span style="font-size: 13px; color: #666;">Satisfied</span>
            </td>
          </tr>
        </table>
        <p class="footer-text">
          Your feedback is important to us and helps us improve.
          <br>
          Thank you for your time!
        </p>
        <!-- Optional: <p style="font-size:12px; color:#adb5bd; margin-top:30px;">&copy; ${new Date().getFullYear()} Your Company Name</p> -->
      </div>
    </body>
    </html>
  `;
  return emailHTML;
}

function generateTicketReceivedEmailHTML(ticketId) {
  return `
    <p>Dear Requestor,</p>
    <p>We have received your request and a ticket has been created. We’ll review your request and revert shortly.</p>
    <br>
    <p>Regards<br>1Office Service Desk Team</p>
  `;
}

module.exports = {
  generateFeedbackEmailHTML,
  generateTicketReceivedEmailHTML,
};
