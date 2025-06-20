// frontend/src/utils/emailTemplates.js
export const generateNewTicketAckEmailHTML = (customerName, ticketId, deskName) => {
  const name = customerName || 'Valued Customer';
  const displayTicketId = ticketId ? `#${ticketId}` : 'N/A';
  // Keep <DeskName> format for display in the email body as per previous request, but remove for plain text signature
  const displayDeskNameInBody = deskName ? `<${deskName}>` : 'Support';
  const plainDeskName = deskName || 'Support'; // For the signature line

  return `
Dear ${name},<br><br>
Thank you for contacting ${plainDeskName}. We have successfully received your request and created support ticket ${displayTicketId} for you.<br>
${plainDeskName} team will review your request shortly.<br><br>
Important Information:<br>
Please keep this ticket ID <b>${displayTicketId}</b> for future reference<br>
Reply to this email to add any additional information to your ticket<br><br>
Thanks & Regards,<br>
${plainDeskName}
  `;
};
