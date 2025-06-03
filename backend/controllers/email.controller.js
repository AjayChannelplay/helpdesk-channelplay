const EmailService = require('../utils/email.service');
const Ticket = require('../models/ticket.model');
const Desk = require('../models/desk.model');
const Message = require('../models/message.model');
const { supabase } = require('../config/db.config');
const axios = require('axios');
const { getMicrosoftAccessToken } = require('../utils/microsoftGraph.utils');

// Utility function to extract desk ID from request (handling both camelCase and snake_case)
const extractDeskId = (req) => {
  let desk_id;
  // Check query parameters
  if (req.query.desk_id) {
    desk_id = String(req.query.desk_id);
    console.log('Using desk_id from query params:', desk_id);
  } else if (req.query.deskId) {
    desk_id = String(req.query.deskId);
    console.log('Using deskId (camelCase) from query params:', desk_id);
  }
  // Check body parameters if not found in query
  else if (req.body && req.body.desk_id) {
    desk_id = String(req.body.desk_id);
    console.log('Using desk_id from form body:', desk_id);
  } else if (req.body && req.body.deskId) {
    desk_id = String(req.body.deskId);
    console.log('Using deskId (camelCase) from form body:', desk_id);
  } else {
    console.error('No desk_id found in either query or body');
    desk_id = null;
  }
  return desk_id;
};

// Reply to an email directly using Microsoft Graph API
exports.replyToEmail = async (req, res) => {
  try {
    console.log('DEBUGGING replyToEmail request:');
    console.log('Request parameters:', req.params);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Request query:', req.query);
    
    // Extract emailId from path parameter
    const { emailId } = req.params;
    
    // Extract desk_id using utility function (handles both desk_id and deskId formats)
    const desk_id = extractDeskId(req);
    
    // Enhanced validation for desk_id
    if (!desk_id || desk_id === 'null' || desk_id === 'undefined') {
      console.error(`Invalid desk_id: '${desk_id}'. Type: ${typeof desk_id}`);
      return res.status(400).json({ message: 'Desk ID is required or invalid' });
    }
    
    // When using multer, form fields are in req.body and files are in req.files
    if (!req.body) {
      console.error('Request body is undefined!');
      return res.status(400).json({ message: 'No request body found' });
    }
    
    const content = req.body.content;
    const sender_name = req.body.sender_name || 'Support Agent';
    const sender_email = req.body.sender_email || '';
    
    // Handle cc_recipients as it might be a string from FormData or an array
    let cc_recipients = [];
    if (req.body['cc_recipients[]']) {
      // FormData sends arrays with [] in the name
      cc_recipients = Array.isArray(req.body['cc_recipients[]']) 
        ? req.body['cc_recipients[]'] 
        : [req.body['cc_recipients[]']];
    }
    
    // Get file attachments from multer
    const attachments = req.files || [];
    
    // Validate required fields with better error messages
    if (!emailId) {
      return res.status(400).json({ message: 'Email ID is required' });
    }
    
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    // Enhanced validation for desk_id
    if (!desk_id || desk_id === 'null' || desk_id === 'undefined') {
      console.error(`Invalid desk_id: '${desk_id}'. Type: ${typeof desk_id}`);
      return res.status(400).json({ message: 'Desk ID is required or invalid' });
    }
    
    console.log(`Using desk_id: '${desk_id}' (${typeof desk_id})`, req.query);
    
    console.log('Replying to email ID:', emailId, 'for desk:', desk_id);
    
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(desk_id);
    
    // Format CC recipients for Microsoft Graph API
    const formattedCcRecipients = cc_recipients.map(email => ({
      emailAddress: { address: email }
    }));
    
    // Get message details to get original recipients
    const messageResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const originalMessage = messageResponse.data;

    // Detailed logging for recipient debugging
    console.log('\n--- Debugging Email Reply ---');
    console.log('Original Message ID being replied to:', originalMessage.id);
    // console.log('Original Subject:', originalMessage.subject); // Subject can be long
    console.log('Original From:', JSON.stringify(originalMessage.from, null, 2));
    console.log('Original Sender:', JSON.stringify(originalMessage.sender, null, 2));
    console.log('Original ToRecipients:', JSON.stringify(originalMessage.toRecipients, null, 2));
    // console.log('Original CcRecipients:', JSON.stringify(originalMessage.ccRecipients, null, 2));

    const calculatedReplyToRecipients = originalMessage.from ? [originalMessage.from] : (originalMessage.sender ? [originalMessage.sender] : []);
    
    console.log('Calculated To-Recipients for this reply:', JSON.stringify(calculatedReplyToRecipients, null, 2));
    console.log('Calculated CC-Recipients for this reply (from form + original thread):', JSON.stringify(formattedCcRecipients, null, 2));
    console.log('--- End Debugging Email Reply ---\n');
    
    const formattedContent = content;
    
    // Log attachment information
    console.log(`Processing ${attachments.length} attachments for email reply`);
    if (attachments.length > 0) {
      attachments.forEach((file, index) => {
        console.log(`Attachment ${index + 1}: ${file.originalname}, ${file.size} bytes, ${file.mimetype}`);
      });
    }
    
    // Prepare the attachment payload for Microsoft Graph API if there are attachments
    let attachmentPayload = [];
    if (attachments.length > 0) {
      attachmentPayload = attachments.map(file => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.originalname,
        contentType: file.mimetype,
        contentBytes: file.buffer.toString('base64')
      }));
    }
    
    // Send reply using Microsoft Graph API
    await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}/reply`,
      {
        message: {
          toRecipients: calculatedReplyToRecipients,
          ccRecipients: formattedCcRecipients.length > 0 ? formattedCcRecipients : undefined,
          body: {
            contentType: 'HTML',
            content: formattedContent
          },
          attachments: attachments.length > 0 ? attachmentPayload : undefined
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Successfully sent reply via Graph API, now log it to our database
    try {
      // Get sender's (desk's) email and name from Graph API /me endpoint
      const meResponse = await axios.get('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const senderGraphUser = meResponse.data;
      const deskEmailAddress = senderGraphUser.mail || senderGraphUser.userPrincipalName;
      const deskDisplayName = senderGraphUser.displayName;

      const messageDataForDb = {
        desk_id: desk_id,
        microsoft_message_id: null, // Graph API /reply doesn't return the new message ID directly
        microsoft_conversation_id: originalMessage.conversationId,
        subject: originalMessage.subject, // Replies usually adopt the original subject, possibly prefixed with "Re:"
        body_html: formattedContent,
        body_preview: content.substring(0, 255), // Simple preview
        from_address: deskEmailAddress,
        from_name: deskDisplayName,
        to_recipients: calculatedReplyToRecipients.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })),
        cc_recipients: formattedCcRecipients.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })),
        bcc_recipients: [], // Not typically part of a reply form
        sent_at: new Date().toISOString(), // Use sent_at for outgoing
        direction: 'outgoing',
        in_reply_to_microsoft_id: emailId, // ID of the message being replied to
        is_read_on_server: true, // It's an outgoing message
        has_attachments: attachments.length > 0,
        importance: originalMessage.importance, // Inherit importance or set a default
        is_internal: false, // Assuming external reply
      };

      await Message.logMessage(messageDataForDb);
      console.log(`[EmailCtrl] Successfully logged outgoing reply for original email ${emailId} to DB.`);

    } catch (dbError) {
      console.error(`[EmailCtrl] Failed to log outgoing reply for email ${emailId} to database:`, dbError.message, dbError.stack);
      // Do not fail the whole operation if DB logging fails, but log the error
    }
    
    return res.status(200).json({ message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Error replying to email:', error);
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
    }
    return res.status(500).json({ message: error.message || 'Error replying to email' });
  }
};

// Resolve a ticket and send a resolution email with feedback options
exports.resolveTicket = async (req, res) => {
  try {
    console.log('DEBUGGING resolveTicket request:');
    console.log('Request parameters:', req.params);
    console.log('Request body:', req.body);
    console.log('Request query:', req.query);
    
    // Extract emailId from path parameter
    const { emailId } = req.params;
    
    // Extract desk_id using utility function (handles both desk_id and deskId formats)
    const desk_id = extractDeskId(req);
    
    // Enhanced validation for desk_id
    if (!desk_id || desk_id === 'null' || desk_id === 'undefined') {
      console.error(`Invalid desk_id: '${desk_id}'. Type: ${typeof desk_id}`);
      return res.status(400).json({ message: 'Desk ID is required or invalid' });
    }
    
    // Validate required fields
    if (!emailId) {
      return res.status(400).json({ message: 'Email ID is required' });
    }
    
    // Enhanced validation for desk_id
    if (!desk_id || desk_id === 'null' || desk_id === 'undefined') {
      console.error(`Invalid desk_id: '${desk_id}'. Type: ${typeof desk_id}`);
      return res.status(400).json({ message: 'Desk ID is required or invalid' });
    }
    
    console.log(`Resolving ticket for email ID: ${emailId}, desk: ${desk_id}`);
    
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(desk_id);
    
    // Get message details to get original recipients
    const messageResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const originalMessage = messageResponse.data;
    
    // Create the email content with emoji feedback options
    const resolutionContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: #4CAF50;">Your ticket has been resolved</h2>
        <p>Thank you for contacting our support team! Your issue has been marked as resolved.</p>
        <p>We'd love to hear about your experience. Please rate our service by clicking one of the options below:</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="[YOUR_FEEDBACK_URL]?ticketId=${originalMessage.conversationId}&feedback=positive" style="text-decoration: none; margin: 0 10px;">
            <span style="font-size: 32px;">😃</span>
            <p>Great!</p>
          </a>
          
          <a href="[YOUR_FEEDBACK_URL]?ticketId=${originalMessage.conversationId}&feedback=neutral" style="text-decoration: none; margin: 0 10px;">
            <span style="font-size: 32px;">😐</span>
            <p>Okay</p>
          </a>
          
          <a href="[YOUR_FEEDBACK_URL]?ticketId=${originalMessage.conversationId}&feedback=negative" style="text-decoration: none; margin: 0 10px;">
            <span style="font-size: 32px;">😞</span>
            <p>Not satisfied</p>
          </a>
        </div>
        
        <p>If you need further assistance, please don't hesitate to contact us again by replying to this email.</p>
        <p>Best regards,<br>Support Team</p>
      </div>
    `;
    
    // Calculate recipients from original message
    const calculatedReplyToRecipients = originalMessage.from ? [originalMessage.from] : (originalMessage.sender ? [originalMessage.sender] : []);
    
    // Send resolution email using Microsoft Graph API
    await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}/reply`,
      {
        message: {
          toRecipients: calculatedReplyToRecipients,
          body: {
            contentType: 'HTML',
            content: resolutionContent
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Try to update ticket status if associated with a ticket
    try {
      // First, find if this email is associated with a ticket
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .select('ticket_id')
        .eq('microsoft_message_id', emailId)
        .maybeSingle();

      if (messageError) {
        console.error('Error finding message in database:', messageError);
      } else if (messageData && messageData.ticket_id) {
        // If message is associated with a ticket, update ticket status to closed
        const { error: updateError } = await supabase
          .from('tickets')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('id', messageData.ticket_id);
          
        if (updateError) {
          console.error('Error updating ticket status:', updateError);
        } else {
          console.log(`Successfully updated ticket ${messageData.ticket_id} status to closed`);
        }
      }
    } catch (dbError) {
      console.error('Error updating ticket status:', dbError);
      // Don't fail the whole operation if updating ticket status fails
    }
    
    // Log the outgoing resolution email to our database
    try {
      // Get sender's (desk's) email and name
      const meResponse = await axios.get('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const senderGraphUser = meResponse.data;
      const deskEmailAddress = senderGraphUser.mail || senderGraphUser.userPrincipalName;
      const deskDisplayName = senderGraphUser.displayName;

      const messageDataForDb = {
        desk_id: desk_id,
        microsoft_message_id: null, // Graph API /reply doesn't return the new message ID directly
        microsoft_conversation_id: originalMessage.conversationId,
        subject: `Re: ${originalMessage.subject}`, // Prefixed with Re:
        body_html: resolutionContent,
        body_preview: "Your ticket has been resolved. Thank you for contacting our support team!",
        from_address: deskEmailAddress,
        from_name: deskDisplayName,
        to_recipients: calculatedReplyToRecipients.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })),
        cc_recipients: [],
        bcc_recipients: [],
        sent_at: new Date().toISOString(),
        direction: 'outgoing',
        in_reply_to_microsoft_id: emailId,
        is_read_on_server: true,
        has_attachments: false,
        importance: originalMessage.importance,
        is_internal: false,
      };

      await Message.logMessage(messageDataForDb);
      console.log(`[EmailCtrl] Successfully logged resolution email for ticket with original email ${emailId} to DB.`);

    } catch (dbError) {
      console.error(`[EmailCtrl] Failed to log resolution email to database:`, dbError.message, dbError.stack);
      // Do not fail the operation if DB logging fails
    }
    
    return res.status(200).json({ message: 'Ticket resolved and resolution email sent successfully' });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
    }
    return res.status(500).json({ message: error.message || 'Error resolving ticket' });
  }
};

// Get attachment for an email
exports.getAttachment = async (req, res) => {
  try {
    const { emailId, attachmentId } = req.params;
    const { desk_id } = req.query;
    
    if (!emailId || !attachmentId) {
      return res.status(400).json({ message: 'Email ID and attachment ID are required' });
    }
    
    if (!desk_id) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    console.log(`Fetching attachment ${attachmentId} for email ${emailId}`);
    
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(desk_id);
    
    // Get attachment metadata
    const attachmentMetadataResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}/attachments/${attachmentId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const metadata = attachmentMetadataResponse.data;
    
    // For file attachments, we need to decode the contentBytes
    if (metadata.contentBytes) {
      const fileBuffer = Buffer.from(metadata.contentBytes, 'base64');
      
      // Set content type based on attachment name or default to application/octet-stream
      const contentType = metadata.contentType || 'application/octet-stream';
      
      // Set headers for file download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.name}"`);
      
      // Send the file
      return res.send(fileBuffer);
    } else {
      // If it's a reference attachment or other type
      return res.status(200).json(metadata);
    }
  } catch (error) {
    console.error('Error fetching attachment:', error);
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
    }
    return res.status(500).json({ message: error.message || 'Error fetching attachment' });
  }
};

// Send an email for a ticket using Microsoft Graph API
exports.sendEmail = async (req, res) => {
  try {
    console.log('sendEmail - Request parameters:', req.params);
    console.log('sendEmail - Request body:', req.body);
    console.log('sendEmail - Request files:', req.files);
    console.log('sendEmail - Request query:', req.query);
    
    const { ticketId } = req.params;
    
    // IMPORTANT: Get desk_id from EITHER query parameters OR form body
    // This provides flexibility and backward compatibility
    let desk_id;
    if (req.query.desk_id) {
      desk_id = String(req.query.desk_id);
      console.log('Using desk_id from query params:', desk_id);
    } else if (req.body && req.body.desk_id) {
      desk_id = String(req.body.desk_id);
      console.log('Using desk_id from form body:', desk_id);
    } else {
      console.error('No desk_id found in either query or body');
      desk_id = null;
    }
    
    // When using multer, form fields are in req.body and files are in req.files
    const { content, is_internal, update_status } = req.body;
    // Handle recipients format from FormData
    let recipients = [];
    if (req.body.recipients) {
      try {
        recipients = JSON.parse(req.body.recipients);
      } catch (e) {
        console.log('Failed to parse recipients, using empty array');
      }
    }
    
    // Get file attachments from multer
    const attachments = req.files || [];
    
    // Get ticket information
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*, desks(*)')
      .eq('id', ticketId)
      .single();
    
    if (ticketError || !ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Skip external email if it's an internal note
    if (is_internal) {
      // Save as internal note in the database
      const { data: note, error: noteError } = await supabase
        .from('ticket_notes')
        .insert({
          ticket_id: ticketId,
          content,
          is_internal: true,
          created_by: req.userId,
          created_at: new Date().toISOString()
        })
        .single();
      
      if (noteError) {
        return res.status(500).json({ message: 'Failed to save internal note' });
      }
      
      // Update ticket status if needed
      if (update_status) {
        await supabase
          .from('tickets')
          .update({ status: update_status, updated_at: new Date().toISOString() })
          .eq('id', ticketId);
      }
      
      return res.status(200).json({ message: 'Internal note added successfully', note });
    }
    
    // Enhanced validation for desk_id (if provided directly)
    if (desk_id && desk_id !== 'null' && desk_id !== 'undefined') {
      console.log(`Using explicitly provided desk_id: '${desk_id}' for email`);  
    } else {
      // Use the desk_id from the ticket if not explicitly provided
      desk_id = ticket.desk_id;
      console.log(`Using desk_id from ticket: '${desk_id}'`);
    }
    
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(desk_id);
    
    // Prepare email using Microsoft Graph API
    const emailRecipients = recipients && recipients.length > 0 ? 
      recipients : [{ emailAddress: { address: ticket.customer_email } }];
    
    // Log attachment information
    console.log(`Processing ${attachments.length} attachments for ticket email`);
    if (attachments.length > 0) {
      attachments.forEach((file, index) => {
        console.log(`Attachment ${index + 1}: ${file.originalname}, ${file.size} bytes, ${file.mimetype}`);
      });
    }
    
    // Prepare the attachment payload for Microsoft Graph API if there are attachments
    let attachmentPayload = [];
    if (attachments.length > 0) {
      attachmentPayload = attachments.map(file => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.originalname,
        contentType: file.mimetype,
        contentBytes: file.buffer.toString('base64')
      }));
    }
    
    // Send email using Microsoft Graph API
    await axios.post(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        message: {
          subject: `Re: ${ticket.subject}`,
          body: {
            contentType: 'HTML',
            content: content
          },
          toRecipients: emailRecipients,
          attachments: attachments.length > 0 ? attachmentPayload : undefined,
          internetMessageHeaders: [
            {
              name: 'X-Ticket-ID',
              value: ticketId
            }
          ]
        },
        saveToSentItems: true
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Successfully sent email via Graph API, now log it to our database
    try {
      // Get sender's (desk's) email and name from Graph API /me endpoint
      const meResponse = await axios.get('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const senderGraphUser = meResponse.data;
      const deskEmailAddress = senderGraphUser.mail || senderGraphUser.userPrincipalName;
      const deskDisplayName = senderGraphUser.displayName;

      const messageDataForDb = {
        desk_id: desk_id,
        microsoft_message_id: null, // /sendMail endpoint doesn't return the new message ID directly
        microsoft_conversation_id: null, // New email, so new conversation (or null if not tracked this way initially)
        subject: `Re: ${ticket.subject}`, // Matches the subject sent
        body_html: content,
        body_preview: content.substring(0, 255),
        from_address: deskEmailAddress,
        from_name: deskDisplayName,
        to_recipients: emailRecipients.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name || r.emailAddress.address })),
        cc_recipients: [], // sendEmail currently doesn't explicitly handle CCs from request body
        bcc_recipients: [], // sendEmail currently doesn't explicitly handle BCCs from request body
        sent_at: new Date().toISOString(),
        direction: 'outgoing',
        in_reply_to_microsoft_id: null, // This is a new email, not a reply to a specific MS message ID in this context
        is_read_on_server: true,
        has_attachments: attachments.length > 0,
        importance: 'normal', // Or derive from ticket if available
        is_internal: false,
        ticket_id: ticketId, // Associate with the ticket
      };

      await Message.logMessage(messageDataForDb);
      console.log(`[EmailCtrl] Successfully logged outgoing email for ticket ${ticketId} to DB.`);

    } catch (dbError) {
      console.error(`[EmailCtrl] Failed to log outgoing email for ticket ${ticketId} to database:`, dbError.message, dbError.stack);
      // Do not fail the whole operation if DB logging fails, but log the error
    }
    
    // Save reply in database
    const { data: reply, error: replyError } = await supabase
      .from('ticket_replies')
      .insert({
        ticket_id: ticketId,
        content,
        is_internal: false,
        created_by: req.userId,
        created_at: new Date().toISOString()
      })
      .single();
    
    if (replyError) {
      return res.status(500).json({ message: 'Email sent but failed to save reply in database' });
    }
    
    // Update ticket status if needed
    if (update_status) {
      await supabase
        .from('tickets')
        .update({ status: update_status, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
    }
    
    res.status(200).json({ message: 'Email sent successfully', reply });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: error.message || 'Failed to send email' });
  }
};



// Fetch emails for a desk using Microsoft Graph API
exports.fetchEmails = async (req, res) => {
  // TODO: Implement robust pagination for conversations
  // For now, fetches recent messages and forms conversations. Client might need to handle 'load more'.
  const PAGE_LIMIT = 20; // Number of conversations per page (approximate)
  const MESSAGE_FETCH_LIMIT = 100; // Number of recent messages to fetch to build conversations
  try {
    // Check for both parameter formats (deskId and desk_id) for better compatibility
    const deskId = req.query.deskId || req.query.desk_id;
    console.log('Received request for unread emails with conversation view. Query params:', req.query);
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    console.log('Fetching unread emails for desk:', deskId);
    
    // Fetch messages from local DB
    try {
      const { data: dbMessages, error: dbError } = await supabase
        .from('messages')
        .select('*')
        .eq('desk_id', deskId)
        .order('received_at', { ascending: false }) // Get most recent messages first
        .limit(MESSAGE_FETCH_LIMIT);

      if (dbError) {
        console.error('[EmailCtrl] Error fetching messages from DB:', dbError.message);
        // If this is due to the Supabase API key issue, this will fail.
        if (dbError.message.includes('Invalid API key')) {
          console.error("[EmailCtrl] CRITICAL: Supabase API key is invalid. Cannot fetch messages.");
        }
        throw dbError;
      }

      if (!dbMessages) {
        return res.status(200).json([]); // No messages found
      }

      console.log(`[EmailCtrl] Fetched ${dbMessages.length} messages from DB for desk ${deskId}`);

      const conversationMap = {};
      dbMessages.forEach(msg => {
        const conversationId = msg.microsoft_conversation_id;
        if (!conversationId) return; // Skip messages without a conversation ID

        if (!conversationMap[conversationId]) {
          conversationMap[conversationId] = [];
        }
        conversationMap[conversationId].push(msg);
      });

      const conversations = [];
      Object.keys(conversationMap).forEach(conversationId => {
        const messagesInConversation = conversationMap[conversationId].sort((a, b) => {
          const dateA = new Date(a.direction === 'incoming' ? a.received_at : a.sent_at);
          const dateB = new Date(b.direction === 'incoming' ? b.received_at : b.sent_at);
          return dateA - dateB; // Sort messages chronologically within conversation
        });

        if (messagesInConversation.length === 0) return;

        const latestMessage = messagesInConversation[messagesInConversation.length - 1];
        const firstMessage = messagesInConversation[0];

        // Determine if the conversation has unread messages (incoming and not marked as read on server)
        const hasUnread = messagesInConversation.some(
          m => m.direction === 'incoming' && m.is_read_on_server === false
        );
        
        const conversationTimestamp = latestMessage.direction === 'incoming' ? latestMessage.received_at : latestMessage.sent_at;

        conversations.push({
          id: conversationId, // This is the microsoft_conversation_id
          subject: latestMessage.subject,
          preview: latestMessage.body_preview || 'No preview available',
          fromName: latestMessage.from_name || latestMessage.from_address,
          receivedDateTime: conversationTimestamp, // Timestamp of the latest message in conversation
          hasUnread: hasUnread,
          messageCount: messagesInConversation.length,
          messages: messagesInConversation.map(m => ({
            id: m.microsoft_message_id || m.id, // Prefer Microsoft ID, fallback to local DB ID
            subject: m.subject,
            bodyPreview: m.body_preview,
            body: { // Construct body object similar to Graph API
              contentType: m.body_html ? 'HTML' : 'Text',
              content: m.body_html || m.body_text || ''
            },
            from: {
                emailAddress: {
                    name: m.from_name,
                    address: m.from_address
                }
            },
            fromName: m.from_name || m.from_address, // For quick display
            toRecipients: m.to_recipients, // Already an array of objects
            ccRecipients: m.cc_recipients,
            bccRecipients: m.bcc_recipients,
            receivedDateTime: m.direction === 'incoming' ? m.received_at : m.sent_at,
            sentDateTime: m.direction === 'outgoing' ? m.sent_at : null,
            isRead: m.direction === 'incoming' ? m.is_read_on_server : true, // Outgoing are 'read'
            direction: m.direction,
            hasAttachments: m.has_attachments,
            importance: m.importance,
            // attachments: m.attachments_metadata, // If we store attachment metadata separately
          })),
          latestMessageId: latestMessage.microsoft_message_id || latestMessage.id,
          firstMessageId: firstMessage.microsoft_message_id || firstMessage.id,
        });
      });

      // Sort conversations by the timestamp of their latest message, most recent first
      conversations.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));
      
      // TODO: Implement proper pagination for conversations if MESSAGE_FETCH_LIMIT is hit often
      // For now, we return all conversations formed from the fetched messages.
      return res.status(200).json(conversations);

    } catch (dbQueryError) {
      console.error('[EmailCtrl] Error processing messages from DB:', dbQueryError.message, dbQueryError.stack);
      return res.status(500).json({ message: dbQueryError.message || 'Error processing emails from database' });
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
    return res.status(500).json({ message: error.message || 'Error fetching emails' });
  }
};



// Fetch unread emails for a desk using Microsoft Graph API
exports.fetchUnreadEmails = async (req, res) => {
  try {
    // Check for both parameter formats (deskId and desk_id) for better compatibility
    const deskId = req.query.deskId || req.query.desk_id;
    console.log('Received request for unread emails. Query params:', req.query);
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    console.log('Fetching unread emails for desk:', deskId);
    
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(deskId);
    console.log('Access token retrieved successfully');
    
    // Fetch unread emails from Microsoft Graph API
    try {
      console.log('Calling Microsoft Graph API with access token...');
      
      const emailsResponse = await axios.get(
        'https://graph.microsoft.com/v1.0/me/messages?$filter=isRead eq false&$top=25&$select=id,subject,bodyPreview,from,receivedDateTime,hasAttachments,importance,isRead', 
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Microsoft Graph API response received, emails count:', emailsResponse.data.value?.length || 0);
      
      // Process emails to include more readable preview
      const emails = emailsResponse.data.value.map(email => {
        return {
          ...email,
          preview: email.bodyPreview || 'No preview available',
          fromName: email.from?.emailAddress?.name || email.from?.emailAddress?.address
        };
      });
      
      return res.status(200).json(emails);
    } catch (apiError) {
      console.error('Error calling Microsoft Graph API:', apiError.message);
      if (apiError.response) {
        console.error('API response status:', apiError.response.status);
        console.error('API response data:', apiError.response.data);
      }
      throw apiError;
    }
  } catch (error) {
    console.error('Error fetching unread emails:', error);
    return res.status(500).json({ message: error.message || 'Error fetching unread emails' });
  }
};



// Fetch email conversation for a ticket
exports.fetchConversation = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;
    console.log('Fetching conversation for ticket ID:', ticketId);
    
    if (!ticketId) {
      return res.status(400).json({ message: 'Ticket ID is required' });
    }
    
    // Get ticket details including desk ID
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();
      
    console.log('Ticket fetch result:', ticketError ? 'Error' : 'Success');
    
    if (ticketError) {
      console.error('Error fetching ticket:', ticketError.message);
      return res.status(404).json({ message: `Ticket not found: ${ticketError.message}` });
    }
    
    if (!ticket) {
      console.error('No ticket found with ID:', ticketId);
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    console.log('Ticket found:', ticket.id, ticket.subject);
    
    // Get messages for this ticket
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
      
    console.log('Messages fetch result:', messagesError ? 'Error' : 'Success', 'Count:', messages?.length || 0);
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError.message);
      return res.status(500).json({ message: `Error fetching messages: ${messagesError.message}` });
    }
    
    // If no messages are found, create an initial message from the ticket description
    const conversation = messages.length > 0 ? messages : [
      {
        id: 'initial',
        ticket_id: ticket.id,
        sender_email: ticket.customer_email,
        sender_name: ticket.customer_name,
        content: ticket.description || 'No description provided',
        created_at: ticket.created_at,
        is_internal: false
      }
    ];
    
    // Process messages to include more readable content
    const processedConversation = conversation.map(message => {
      return {
        ...message,
        fromName: message.sender_name || message.sender_email,
        type: message.message_type || 'reply',
      };


    });
    
    console.log('Returning conversation with', processedConversation.length, 'messages');
    return res.status(200).json(processedConversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json({ message: error.message || 'Error fetching conversation' });
  }
};
// Mark an email as read
exports.markAsRead = async (req, res) => {
  try {
    const { emailId } = req.params;
    const { deskId } = req.query;
    
    if (!emailId) {
      return res.status(400).json({ message: 'Email ID is required' });
    }
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    console.log(`Marking email ${emailId} as read for desk ${deskId}`);
    
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(deskId);
    
    // Mark email as read using Microsoft Graph API
    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
      { isRead: true },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`Successfully marked email ${emailId} as read`);
    return res.status(200).json({ message: 'Email marked as read successfully' });
  } catch (error) {
    console.error('Error marking email as read:', error.response?.data || error.message);
    return res.status(500).json({ message: error.response?.data?.message || error.message || 'Error marking email as read' });
  }
};


