const EmailService = require('../utils/email.service');
const Ticket = require('../models/ticket.model');
const Desk = require('../models/desk.model');
const Message = require('../models/message.model');
const { uploadFileToS3, getS3ObjectStream } = require('../services/s3.service');
const path = require('path');
const { supabase } = require('../config/db.config');
const axios = require('axios');
const { getMicrosoftAccessToken } = require('../utils/microsoftGraph.utils');
const { assignUserRoundRobin } = require('../utils/assignment.utils');

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
    
    // Handle cc_recipients, expecting a comma-separated string from FormData
    let cc_recipients = [];
    if (req.body.cc_recipients && typeof req.body.cc_recipients === 'string') {
      cc_recipients = req.body.cc_recipients.split(',').map(email => email.trim()).filter(email => email);
    } else if (req.body.cc_recipients && Array.isArray(req.body.cc_recipients)) {
      // Fallback for direct array (e.g., if frontend changes or for other clients)
      cc_recipients = req.body.cc_recipients.map(email => String(email).trim()).filter(email => email);
    } else if (req.body['cc_recipients[]']) {
      // Fallback for FormData array format (less likely with current frontend)
      const rawCcs = Array.isArray(req.body['cc_recipients[]']) 
        ? req.body['cc_recipients[]'] 
        : [req.body['cc_recipients[]']];
      cc_recipients = rawCcs.map(email => String(email).trim()).filter(email => email);
    }
    console.log('Parsed Manual CC Recipients:', cc_recipients);
    
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
    
    // Format manually added CC recipients for Microsoft Graph API
    // Ensure cc_recipients is an array of strings before mapping
    const validManualCcEmails = Array.isArray(cc_recipients) ? cc_recipients.filter(email => typeof email === 'string' && email.includes('@')) : [];
    const manualCcRecipients = validManualCcEmails.map(email => ({
      emailAddress: { address: email.trim() }
    }));
    console.log('Formatted Manual CC for Graph:', JSON.stringify(manualCcRecipients, null, 2));
    
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
    
    // Get original CC recipients from the message being replied to
    const originalCcRecipients = originalMessage.ccRecipients || [];
    console.log('Original CC Recipients:', JSON.stringify(originalCcRecipients, null, 2));
    
    // Only use manually added CC recipients, don't include original thread CCs
    const formattedCcRecipients = [...manualCcRecipients];
    console.log('Using only manual CC recipients for reply:', JSON.stringify(formattedCcRecipients, null, 2));
    
    console.log('Calculated To-Recipients for this reply:', JSON.stringify(calculatedReplyToRecipients, null, 2));
    console.log('Calculated CC-Recipients for this reply (from form + original thread):', JSON.stringify(formattedCcRecipients, null, 2));
    console.log('--- End Debugging Email Reply ---\n');
    
        // 1. Normalize all newline types (e.g., \r\n, \r) to a single \n
    const normalizedContent = content.replace(/\r\n|\r/g, '\n');
    // 2. Trim leading/trailing whitespace from the entire content block
    const trimmedContent = normalizedContent.trim();
    // 3. Replace one or more occurrences of (optional whitespace + newline + optional whitespace) with a single <br>
    // This collapses multiple blank lines (even with spaces) into one <br>
    const formattedContent = trimmedContent.replace(/(?:\s*\n\s*)+/g, '<br>');
    
    // Log attachment information
    console.log(`Processing ${attachments?.length || 0} attachments for email reply`);
    console.log('Request Files object:', JSON.stringify(req.files?.map(f => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })) || [], null, 2));
    
    // Prepare the attachment payload for Microsoft Graph API
    let attachmentPayload = [];
    let s3AttachmentUrls = [];
    
    if (attachments && attachments.length > 0) {
      console.log('🗂️ Found attachments in the reply:');
      
      // Log detailed attachment info
      attachments.forEach((file, index) => {
        console.log(`📎 Attachment ${index + 1}: ${file.originalname}, ${file.size} bytes, ${file.mimetype}`);
        console.log('   Buffer exists:', !!file.buffer, 'Buffer length:', file.buffer?.length || 0);
      });
      
      try {
        console.log(`🚀 Uploading ${attachments.length} files to S3 in folder: attachments/${desk_id}`);
        
        // Step 1: Upload files to S3 in parallel
        const uploadPromises = attachments.map(file => uploadFileToS3(file, `attachments/${desk_id}`));
        const uploadedFiles = await Promise.all(uploadPromises);
        
        console.log(`✅ Successfully uploaded ${uploadedFiles.length} files to S3`);
        
        // Step 2: Store the S3 URLs in a format ready for the database
        s3AttachmentUrls = uploadedFiles.map(file => ({
          name: file.originalName,
          url: file.url,
          contentType: file.contentType,
          size: file.size,
          s3Key: file.s3Key
        }));
        
        console.log('📊 S3 attachment URLs prepared:', JSON.stringify(s3AttachmentUrls));
        
        // Step 3: Create payload for Microsoft Graph API
        attachmentPayload = attachments.map(file => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: file.originalname,
          contentType: file.mimetype,
          contentBytes: file.buffer.toString('base64')
        }));
        
        console.log('📤 Microsoft Graph attachment payload prepared');
      } catch (error) {
        console.error('❌ Error in attachment processing:', error);
        return res.status(500).json({ 
          message: `Error processing attachments: ${error.message}`,
          success: false 
        });
      }
    } else {
      console.log('ℹ️ No attachments found in the reply');
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

      // --- START MODIFICATION: Find the ticket and prepare its ID ---
      let ticketIdToAssociate = null;
      let ticketToUpdate = null;

      if (originalMessage.conversationId) {
        console.log(`[EmailCtrl] Attempting to find ticket with conversation_id: ${originalMessage.conversationId}`);
        const { data: foundTicket, error: findTicketError } = await supabase
          .from('tickets')
          .select('*')
          .eq('conversation_id', originalMessage.conversationId)
          .single();

        if (findTicketError && findTicketError.code !== 'PGRST116') { // PGRST116: 0 rows
          console.error(`[EmailCtrl] Error finding ticket by conversation_id ${originalMessage.conversationId}:`, findTicketError);
        } else if (foundTicket) {
          ticketIdToAssociate = foundTicket.id;
          ticketToUpdate = foundTicket; // Keep the found ticket object for updating later
          console.log(`[EmailCtrl] Found ticket ID ${ticketIdToAssociate} for conversation_id ${originalMessage.conversationId}`);
        } else {
          console.log(`[EmailCtrl] No ticket found with conversation_id ${originalMessage.conversationId}. Will log message without direct ticket_id.`);
        }
      } else {
        console.warn('[EmailCtrl] originalMessage.conversationId is null or undefined. Cannot associate with a ticket.');
      }
      // --- END MODIFICATION ---

      // Log attachment information right before database save
      console.log(`📎 CONFIRMATION: has_attachments=${attachments.length > 0}, attachment count=${attachments.length}`);
      console.log(`📎 CONFIRMATION: s3AttachmentUrls length=${s3AttachmentUrls.length}`);
      if (s3AttachmentUrls.length > 0) {
        console.log(`📎 First attachment: ${JSON.stringify(s3AttachmentUrls[0])}`);
      }
      
      const messageDataForDb = {
        desk_id,
        // --- MODIFICATION: Use the found ticketIdToAssociate ---
        ticket_id: ticketIdToAssociate, 
        // --- END MODIFICATION ---
        microsoft_message_id: null, // Graph API /reply doesn't return the new message ID directly
        microsoft_conversation_id: originalMessage.conversationId,
        subject: originalMessage.subject, // Replies usually adopt the original subject, possibly prefixed with "Re:"
        body_preview: content.substring(0, 255), // Simple preview
        body_html: formattedContent,
        body_text: content,
        from_address: deskEmailAddress,
        from_name: deskDisplayName,
        to_recipients: calculatedReplyToRecipients.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name })),
        cc_recipients: formattedCcRecipients.map(r => ({ email: r.emailAddress.address, name: r.emailAddress.name || '' })),
        bcc_recipients: [], // Not typically part of a reply form
        sent_at: new Date().toISOString(), // Use sent_at for outgoing
        has_attachments: attachments.length > 0,
        direction: 'outgoing',
        in_reply_to_microsoft_id: emailId, // ID of the message being replied to
        assigned_to_user_id: req.userId, // Assign the outgoing reply to the agent sending it
        is_read_on_server: true, // It's an outgoing message
        sender_id: req.userId, // Internal user ID of the agent who replied
        attachments_urls: s3AttachmentUrls, // Store S3 URLs in the database
      };

      // --- BEGIN DIAGNOSTIC LOGGING for assigned_to_user_id --- 
      console.log(`[EmailCtrl-DEBUG] replyToEmail: req.userId = ${req.userId} (Type: ${typeof req.userId})`);
      console.log(`[EmailCtrl-DEBUG] replyToEmail: messageDataForDb.assigned_to_user_id BEFORE logMessage = ${messageDataForDb.assigned_to_user_id} (Type: ${typeof messageDataForDb.assigned_to_user_id})`);
      console.log(`[EmailCtrl-DEBUG] replyToEmail: messageDataForDb.sender_id BEFORE logMessage = ${messageDataForDb.sender_id} (Type: ${typeof messageDataForDb.sender_id})`);
      // --- END DIAGNOSTIC LOGGING --- 

      const loggedMessage = await Message.logMessage(messageDataForDb);
      console.log('[EmailCtrl] Reply logged to DB:', loggedMessage?.id);
      
      // --- START MODIFICATION: Update ticket message_count and last_message_sent_at ---
      if (ticketToUpdate && loggedMessage) { // Ensure message was successfully logged
        try {
          const newStatus = ticketToUpdate.status === 'new' ? 'open' : ticketToUpdate.status; // Change 'new' to 'open'
          
          const { data: updatedTicket, error: updateTicketError } = await supabase
            .from('tickets')
            .update({ 
              message_count: ticketToUpdate.message_count + 1,
              last_message_sent_at: new Date().toISOString(),
              status: newStatus, // Update status if needed
              updated_at: new Date().toISOString() // Also update the 'updated_at' timestamp
            })
            .eq('id', ticketToUpdate.id)
            .select() // To get the updated record back
            .single();

          if (updateTicketError) {
            console.error(`[EmailCtrl] Failed to update ticket ${ticketToUpdate.id} message_count/last_message_sent_at:`, updateTicketError);
          } else {
            console.log(`[EmailCtrl] Successfully updated ticket ${updatedTicket.id}: message_count to ${updatedTicket.message_count}, last_message_sent_at to ${updatedTicket.last_message_sent_at}, status to ${updatedTicket.status}`);
          }
        } catch (ticketUpdateErr) {
          console.error(`[EmailCtrl] Exception during ticket update for ${ticketToUpdate.id}:`, ticketUpdateErr);
        }
      } else if (ticketToUpdate && !loggedMessage) {
        console.warn(`[EmailCtrl] Message logging failed for conversation ${originalMessage.conversationId}. Skipping ticket update.`);
      }
      // --- END MODIFICATION ---

      console.log(`[EmailCtrl-DEBUG] replyToEmail: loggedMessage.assigned_to_user_id AFTER logMessage = ${loggedMessage?.assigned_to_user_id}`);
      console.log(`[EmailCtrl] Successfully logged outgoing reply for original email ${emailId} to DB.`);
      console.log(`[EmailCtrl] Message ID in database: ${loggedMessage?.id || 'unknown'}`);
      console.log(`[EmailCtrl] Confirmed has_attachments in DB: ${loggedMessage?.has_attachments || false}`);
      console.log(`[EmailCtrl] Confirmed attachments_urls length in DB: ${(loggedMessage?.attachments_urls || []).length}`);

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
exports.resolveTicket = async (req, res, status) => {
  try {
    console.log('DEBUGGING resolveTicket request:');
    console.log('Request parameters:', req.params);
    console.log('Request body:', req.body);
    console.log('Request query:', req.query);
    //console.log("Jiiiiiiiiiiiiiiiiii@@@@",status)
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
    
    // Fetch ticket and desk details
    const { supabase } = require('../config/db.config');
    const { data: ticketData, error: ticketError } = await supabase
      .from('tickets')
      .select('*, desks(*)')
      .eq('conversation_id', originalMessage.conversationId)
      .single();

    if (ticketError || !ticketData) {
      console.error(`Failed to fetch ticket with conversation_id ${originalMessage.conversationId}:`, ticketError);
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Fetch previous feedback for this ticket
    let previousRating = null;
    if (ticketData.id) {
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback')
        .select('rating')
        .eq('ticket_id', ticketData.id)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (!feedbackError && feedbackData && feedbackData.length > 0) {
        previousRating = feedbackData[0].rating;
        console.log(`Found previous rating: ${previousRating} for ticket ${ticketData.id}`);
      }
    }
    
    const deskData = ticketData.desks;
    
    const recipientName = originalMessage.from?.emailAddress?.name || 'Valued Customer';
    const deskName = deskData?.name || 'Support Team';
    const userTicketId = ticketData?.user_ticket_id || 'N/A';
    //const userTicketStatus = ticketData?.status || 'N/A';
    //console.log("User Ticket data are------------>",ticketData,userTicketId)
    let baseFeedbackUrlWithScheme;
    const feedbackPath = '/api/feedback/process';

    if (process.env.NODE_ENV === 'production') {
      const productionHost = process.env.BACKEND_URL || 'api.channelplay.in'; // Default to api.channelplay.in if BACKEND_URL not set in prod
      baseFeedbackUrlWithScheme = `https://${productionHost}${feedbackPath}`;
    } else {
      const developmentHost = process.env.BACKEND_URL || 'localhost:3001';
      baseFeedbackUrlWithScheme = `http://${developmentHost}${feedbackPath}`;
    }
    console.log("Desk data are --------->",deskData);
    console.log("Ticket data are --------->",ticketData)
    const resolutionContent = `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      </head>
      <body style="font-family: sans-serif; font-size: 14px; color: #333;">
        <p>Dear ${recipientName},</p>
        <p>We're pleased to inform you that your support Ticket ID: <strong>#${userTicketId}</strong> has been successfully resolved.</p>
        ${previousRating && previousRating > 0 ? `<p>Your previous rating for this ticket was: <strong>${previousRating}/10</strong></p>` : ''}
        <p>We'd love to hear about your experience! Please rate our service for this request:</p>
        
        <!-- Rating Scale HTML -->
        <div style="margin: 25px 0; text-align: left;">
          <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; display: inline-block;">
            <tr>
              <td style="font-size: 13px; color: #666; font-weight: 500; padding-right: 15px; vertical-align: middle; white-space: nowrap;">Very Dissatisfied</td>
              <td style="vertical-align: middle;">
                <div style="display: flex; gap: 5px;">
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=1" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#e74c3c'; this.style.borderColor='#e74c3c'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">1</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=2" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#e74c3c'; this.style.borderColor='#e74c3c'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">2</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=3" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#e74c3c'; this.style.borderColor='#e74c3c'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">3</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=4" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#f1c40f'; this.style.borderColor='#f1c40f'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">4</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=5" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#f1c40f'; this.style.borderColor='#f1c40f'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">5</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=6" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#f1c40f'; this.style.borderColor='#f1c40f'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">6</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=7" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#2ecc71'; this.style.borderColor='#2ecc71'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">7</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=8" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#2ecc71'; this.style.borderColor='#2ecc71'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">8</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=9" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#27ae60'; this.style.borderColor='#27ae60'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">9</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=10" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#1e8449'; this.style.borderColor='#1e8449'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">10</a>
                </div>
              </td>
              <td style="font-size: 13px; color: #666; font-weight: 500; padding-left: 15px; vertical-align: middle; white-space: nowrap;">Very Satisfied</td>
            </tr>
          </table>
        </div>
        
        <p>Note: If you need to reopen this ticket, please reply within 5 days. After this period, a new ticket will be created for any additional requests.</p>
        <br>
        <p>Thanks & Regards,<br>${deskName}</p>
      </body>
      </html>
    `;
    const resolutionContentAfterResolved = `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      </head>
      <body style="font-family: sans-serif; font-size: 14px; color: #333;">
        <p>Dear ${recipientName},</p>
        <p>We'd like to inform you that your support Ticket ID: <strong>#${userTicketId}</strong>, which was previously reopened, has now been resolved again.</p>
        ${previousRating && previousRating > 0 ? `<p>Your previous rating for this ticket was: <strong>${previousRating}/10</strong></p>` : ''}
        <p>We truly value your input and would appreciate it if you could share your updated feedback based on your most recent experience.</p>
        <p>Please rate your experience now:</p>
        <!-- Rating Scale HTML -->
        <div style="margin: 25px 0; text-align: left;">
          <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; display: inline-block;">
            <tr>
              <td style="font-size: 13px; color: #666; font-weight: 500; padding-right: 15px; vertical-align: middle; white-space: nowrap;">Very Dissatisfied</td>
              <td style="vertical-align: middle;">
                <div style="display: flex; gap: 5px;">
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=1" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#e74c3c'; this.style.borderColor='#e74c3c'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">1</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=2" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#e74c3c'; this.style.borderColor='#e74c3c'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">2</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=3" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#e74c3c'; this.style.borderColor='#e74c3c'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">3</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=4" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#f1c40f'; this.style.borderColor='#f1c40f'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">4</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=5" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#f1c40f'; this.style.borderColor='#f1c40f'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">5</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=6" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#f1c40f'; this.style.borderColor='#f1c40f'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">6</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=7" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#2ecc71'; this.style.borderColor='#2ecc71'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">7</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=8" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#2ecc71'; this.style.borderColor='#2ecc71'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">8</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=9" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#27ae60'; this.style.borderColor='#27ae60'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">9</a>
                  <a href="${baseFeedbackUrlWithScheme}?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=10" style="display: inline-block; width: 35px; height: 35px; line-height: 35px; text-align: center; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 50%; color: #495057; text-decoration: none; font-weight: 600; font-size: 14px;" onmouseover="this.style.backgroundColor='#1e8449'; this.style.borderColor='#1e8449'; this.style.color='white';" onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#e9ecef'; this.style.color='#495057';">10</a>
                </div>
              </td>
              <td style="font-size: 13px; color: #666; font-weight: 500; padding-left: 15px; vertical-align: middle; white-space: nowrap;">Very Satisfied</td>
            </tr>
          </table>
        </div>
        
        <p>Note: If you still face any issues or wish to discuss further, feel free to reply to this message within 5 days. After that, a new ticket will be raised for any follow-up.</p>
        <br>
        <p>Thank you for helping us improve</p>
        <br>
        <p>Thanks & Regards,<br>${deskName}</p>
      </body>
      </html>
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
            content: status === 'open' ? resolutionContent : resolutionContentAfterResolved
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
    
    // The ticket and message statuses are handled by the ticket controller. 
    // This section is removed to prevent redundant database updates and potential recursive triggers.
    
    // Skip logging the feedback email to our database to prevent it from appearing in the thread
    console.log(`[EmailCtrl] Skipping database logging for feedback email to prevent it from appearing in the ticket thread.`);
    


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
    
    // Check if we have attachments
    console.log(`Processing ${attachments?.length || 0} attachments for ticket email`);
    
    // Arrays to store attachment data
    let attachmentPayload = [];
    let s3AttachmentUrls = [];
    
    // Upload each attachment to S3 and prepare the payload for Microsoft Graph API
    if (attachments && attachments.length > 0) {
      console.log('🗂️ Found attachments in the request:');
      
      // Log detailed attachment info
      attachments.forEach((file, index) => {
        console.log("--------------------------------->>>>>>>>>>")
        console.log(`📎 Attachment ${index + 1}: ${file.originalname}, ${file.size} bytes, ${file.mimetype}`);
        console.log('   Buffer exists:', !!file.buffer, 'Buffer length:', file.buffer?.length || 0);
      });
      
      try {
        console.log(`🚀 Uploading ${attachments.length} files to S3 in folder: attachments/${desk_id}`);
        
        // Step 1: Upload files to S3 in parallel
        const uploadPromises = attachments.map(file => uploadFileToS3(file, `attachments/${desk_id}`));
        const uploadedFiles = await Promise.all(uploadPromises);
        
        console.log(`✅ Successfully uploaded ${uploadedFiles.length} files to S3`);
        
        // Step 2: Store the S3 URLs in a format ready for the database
        s3AttachmentUrls = uploadedFiles.map(file => ({
          name: file.originalName,
          url: file.url,
          contentType: file.contentType,
          size: file.size,
          s3Key: file.s3Key
        }));
        
        console.log('📊 S3 attachment URLs prepared:', JSON.stringify(s3AttachmentUrls));
        
        // Step 3: Create payload for Microsoft Graph API
        attachmentPayload = attachments.map(file => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: file.originalname,
          contentType: file.mimetype,
          contentBytes: file.buffer.toString('base64')
        }));
        
        console.log('📤 Microsoft Graph attachment payload prepared');
      } catch (error) {
        console.error('❌ Error in attachment processing:', error);
        return res.status(500).json({ 
          message: `Error processing attachments: ${error.message}`,
          success: false 
        });
      }
    } else {
      console.log('ℹ️ No attachments found in the request');
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
        attachments_urls: s3AttachmentUrls, // Store S3 URLs for frontend display
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



// Endpoint for Microsoft Graph webhook notification
exports.handleIncomingNotification = async (req, res) => {
  try {
    console.log('\n🚀🚀🚀 ENTERED handleIncomingNotification 🚀🚀🚀');
    console.log('====================================================');
    console.log('📨 INCOMING EMAIL WEBHOOK NOTIFICATION RECEIVED (handleIncomingNotification)');
    console.log('====================================================');
    
    // Microsoft webhook validation requires responding to subscription validation
    if (req.query && req.query['validationToken']) {
      console.log('🔐 Validation token request detected');
      console.log('🔑 Validation token:', req.query['validationToken']);
      res.set('Content-Type', 'text/plain');
      return res.status(200).send(req.query['validationToken']);
    }
    
    // Process notification
    console.log('📝 Processing webhook payload:', JSON.stringify(req.body, null, 2));
    
    const notifications = req.body.value || [];
    console.log(`📫 Found ${notifications.length} notifications to process`);
    
    if (notifications.length > 0) {
      console.log('⚡ Starting async processing of notifications... (handleIncomingNotification)');
      
      // Process notifications asynchronously so we can respond quickly to the webhook
      processWebhookNotifications(notifications).catch(err => {
        console.error('❌ CRITICAL ERROR PROCESSING WEBHOOK NOTIFICATIONS:', err);
      });
    } else {
      console.log('⚠️ No notifications to process in webhook payload');
    }
    
    // Return success response immediately to acknowledge receipt
    console.log('✅ Sending 202 Accepted response to webhook caller');
    return res.status(202).json({ message: 'Notification received and will be processed' });
  } catch (error) {
    console.error('❌ ERROR PROCESSING WEBHOOK NOTIFICATION:', error);
    return res.status(500).json({ message: error.message || 'Error processing notification' });
  }
};

// Process webhook notifications asynchronously
const processWebhookNotifications = async (notifications) => {
  console.log('\n📬📬📬 ENTERED processWebhookNotifications 📬📬📬');
  try {
    console.log('===========================================================');
    console.log(`📥 PROCESSING ${notifications.length} WEBHOOK NOTIFICATIONS (processWebhookNotifications)`);
    console.log('===========================================================');

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      console.log(`\n📦 Processing notification ${i+1}/${notifications.length}`);
      
      // Get the subscription ID to identify which mailbox this is for
      const subscriptionId = notification.subscriptionId;
      const resourceData = notification.resourceData || {};
      
      console.log(`💬 Notification details:`);
      console.log(`- Subscription: ${subscriptionId}`);
      console.log(`- Resource: ${resourceData.id || 'unknown'}`);
      console.log(`- Change type: ${notification.changeType || 'unknown'}`);
      
      // Find the desk associated with this subscription
      console.log(`🔍 Looking up desk for subscription: ${subscriptionId}`);
      const { data: subscriptions, error: subError } = await supabase
        .from('microsoft_subscriptions')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .limit(1);
        
      if (subError || !subscriptions || subscriptions.length === 0) {
        console.error('❌ Could not find subscription:', subscriptionId, subError);
        continue;
      }
      
      const desk_id = subscriptions[0].desk_id;
      console.log(`✅ Found desk: ${desk_id} for subscription ${subscriptionId}`);
      
      // CRITICAL DEBUG INFO: Log full desk details to verify it exists
      const { data: deskDetails, error: deskError } = await supabase
        .from('desks')
        .select('*')
        .eq('id', desk_id)
        .single();
        
      if (deskError) {
        console.error(`❌❌❌ ERROR FINDING DESK ${desk_id}:`, deskError);
      } else {
        console.log(`✅✅ DESK INFO for ${desk_id}:`, JSON.stringify(deskDetails));
        console.log(`👥 Current last_assigned_user_id:`, deskDetails.last_assigned_user_id || 'NULL');
      }
      
      // Get all users assigned to this desk
      const { data: deskUsers, error: deskUsersError } = await supabase
        .from('desk_assignments')
        .select('user_id')
        .eq('desk_id', desk_id);
        
      if (deskUsersError) {
        console.error(`❌❌❌ ERROR FINDING DESK USERS FOR ${desk_id}:`, deskUsersError);
      } else if (!deskUsers || deskUsers.length === 0) {
        console.warn(`⚠️⚠️ NO USERS ASSIGNED TO DESK ${desk_id}. Round-robin assignment will fail!`);
      } else {
        console.log(`👥👥 FOUND ${deskUsers.length} USERS assigned to desk ${desk_id}:`, JSON.stringify(deskUsers));
      }
      
      // Get message details
      if (resourceData.id) {
        console.log(`📧 Processing message: ${resourceData.id} for desk ${desk_id} (processWebhookNotifications)`);
        
        try {
          // First, let's check if this message already exists in our database
          const { data: existingMsg, error: existingMsgError } = await supabase
            .from('messages')
            .select('id') // Only need id to check for existence
            .eq('microsoft_message_id', resourceData.id)
            .maybeSingle(); // Use maybeSingle to handle 0 or 1 result without error

          if (existingMsgError) {
            console.error(`❌ DB_ERROR checking for existing message ${resourceData.id}:`, existingMsgError);
            // Decide if you want to continue or skip this notification
            continue; // Skip to next notification on DB error
          }
            
          if (existingMsg) {
            console.log(`📬 Message ${resourceData.id} already exists in database with ID ${existingMsg.id}. Skipping new email processing. (processWebhookNotifications)`);
          } else {
            console.log(`✨ Message ${resourceData.id} is new. Calling processNewIncomingEmail. (processWebhookNotifications)`);
            // Process each new email individually
            // No need to await here as processNewIncomingEmail is async and handles its own errors
            processNewIncomingEmail(resourceData.id, desk_id).catch(emailProcessingError => {
              console.error(`❌ ASYNC_ERROR from processNewIncomingEmail for ${resourceData.id}:`, emailProcessingError);
            });
          }
        } catch (msgProcessingError) {
          console.error(`❌ UNCAUGHT_ERROR during message check/dispatch for ${resourceData.id}:`, msgProcessingError);
        }
      } else {
        console.warn('⚠️ No message ID in notification, skipping processing');
      }
    }
    
    console.log('===========================================================');
    console.log('✅ FINISHED PROCESSING ALL WEBHOOK NOTIFICATIONS');
    console.log('===========================================================');
  } catch (error) {
    console.error('❌ ERROR IN WEBHOOK NOTIFICATION PROCESSING:', error);
  }
};

// Process a new incoming email
const processNewIncomingEmail = async (messageId, desk_id) => {
  console.log('\n📩📩📩 ENTERED processNewIncomingEmail 📩📩📩 - Message ID:', messageId, 'Desk ID:', desk_id);
  console.log('======================================================');
  console.log(`🔄 STARTING INCOMING EMAIL ATTACHMENT PIPELINE (processNewIncomingEmail)`);
  console.log(`📧 Message ID: ${messageId} | Desk ID: ${desk_id}`);
  console.log('======================================================');

  try {
    // STEP 1: INCOMING EMAIL WEBHOOK
    console.log('\n📥 STEP 1: PROCESSING WEBHOOK DATA');
    // Get access token for Microsoft Graph API
    const accessToken = await getMicrosoftAccessToken(desk_id);
    if (!accessToken) {
      throw new Error('Failed to get Microsoft access token');
    }
    console.log('✓ Microsoft access token obtained');

    // Fetch complete email details including attachments
    const msgResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$expand=attachments`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const email = msgResponse.data;
    console.log('📬 Full email object from Graph API:', JSON.stringify(email, null, 2)); // Log the entire email object
    console.log(`✓ Email fetched - Subject: "${email.subject}"`);
    console.log(`✓ From: ${email.from?.emailAddress?.address || 'Unknown'}`);
    console.log(`✓ Has attachments: ${email.hasAttachments ? 'Yes' : 'No'}`);
    
    // This section creates/updates the message record even if there are no attachments
    // STEP 1.5: CREATE OR UPDATE MESSAGE RECORD
    console.log('\n📝 STEP 1.5: CREATING/UPDATING MESSAGE RECORD WITH ROUND-ROBIN ASSIGNMENT');
    
    try {
      // First check if message already exists
      const { data: existingMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('microsoft_message_id', messageId);
        
      if (existingMessages && existingMessages.length > 0) {
        console.log(`\n✅ Message already exists in database with ID: ${existingMessages[0].id}`);
      } else {
        // Message doesn't exist yet, create it with proper fields
        console.log('\n✨ Creating new message record with round-robin assignment');
        
        // Prepare message data
        const messageData = {
          microsoft_message_id: messageId,
          microsoft_conversation_id: email.conversationId,
          subject: email.subject || '(No Subject)',
          body: email.body?.content || '',
          body_type: email.body?.contentType || 'text',
          sender_email: email.from?.emailAddress?.address || '',
          sender_name: email.from?.emailAddress?.name || '',
          recipients: email.toRecipients?.map(r => r.emailAddress?.address).filter(Boolean) || [],
          received_date: email.receivedDateTime,
          desk_id: desk_id, // Crucial for round-robin assignment
          direction: 'incoming',
          is_read: email.isRead || false
        };
        
        console.log('\n📥 Prepared message data (before assignment):', JSON.stringify(messageData, null, 2));
        
        // Use the message model which handles round-robin assignment
        try {
          const savedMessage = await Message.logMessage(messageData);
          console.log(`\n✅✅ Message created successfully with ID: ${savedMessage?.id || 'unknown'}`);
          console.log(`\n👥 Assigned to user_id: ${savedMessage?.assigned_to_user_id || 'NULL'}`);
        } catch (msgErr) {
          console.error('\n❌ ERROR creating message with round-robin assignment:', msgErr);
        }
      }
    } catch (msgDbErr) {
      console.error('\n❌ DATABASE ERROR while checking/creating message:', msgDbErr);
    }
    
    let attachments = [];
    let attachmentsSource = ''; // For logging

    // STEP 2: DETERMINE ATTACHMENT SOURCE AND PARSE
    console.log('\n📦 STEP 2: DETERMINING ATTACHMENT SOURCE AND PARSING');

    // Check if attachments were expanded and are available directly in the email object
    if (email.attachments && email.attachments.length > 0) {
      attachments = email.attachments;
      attachmentsSource = 'expanded from message object';
      console.log(`✓ Attachments found directly in message object (due to $expand). Count: ${attachments.length}`);
    } else if (email.hasAttachments) {
      // Fallback: if hasAttachments is true but attachments weren't expanded (or $expand failed/not used),
      // fetch them separately.
      console.log('✓ email.hasAttachments is true, but no attachments in expanded response. Fetching separately...');
      try {
        const attachmentsResponse = await axios.get(
          `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        attachments = attachmentsResponse.data.value;
        attachmentsSource = 'fetched via separate API call';
        if (attachments && attachments.length > 0) {
            console.log(`✓ Attachments fetched via separate API call. Count: ${attachments.length}`);
        } else {
            console.log('⚠️ Attachments API call returned no attachments, despite hasAttachments being true.');
            attachments = []; // Ensure attachments is an empty array
        }
      } catch (error) {
        console.error('❌ Error fetching attachments separately:', error);
        attachments = []; // Ensure attachments is an empty array on error
      }
    } else {
      console.log('\n⚠️ No attachments indicated by hasAttachments flag or found in expanded response. Assuming no attachments.');
      // Message record is already created/updated before this block.
      // s3UploadResults will remain empty, and thus attachments_urls will be empty for the DB update.
    }

    if (!attachments || attachments.length === 0) {
      console.log(`✓ No processable attachments found from source: '${attachmentsSource || 'N/A'}'. Proceeding without attachment upload.`);
    } else {
      console.log(`✓ Processing ${attachments.length} attachments from '${attachmentsSource}':`);
    }
    attachments.forEach((att, i) => {
      console.log(`  ${i+1}) Name: ${att.name}, Type: ${att.contentType}, Size: ${att.size || 'unknown'} bytes, Inline: ${att.isInline}, ContentId: ${att.contentId}`);
    });

    // STEP 3: UPLOAD TO S3 (NO ACL)
    // This console log should be conditional on attachments actually being processed
    if (attachments && attachments.length > 0) {
        console.log('\n☁️ STEP 3: UPLOADING ATTACHMENTS TO S3');
    }
    
    // Array to store results from S3 uploads
    const s3UploadResults = [];
    
    // Process each attachment
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      console.log(`\n📎 Processing attachment ${i+1}/${attachments.length}: ${attachment.name}`);
      
      try {
        if (!attachment.contentBytes) {
          console.error(`❌ Missing contentBytes for attachment: ${attachment.name}`);
          continue;
        }
        
        // 2a. DECODE BASE64
        console.log(`→ Decoding base64 content...`);
        // Log a small sample of the base64 content to verify it's valid
        console.log(`Base64 sample (first 40 chars): ${attachment.contentBytes.substring(0, 40)}...`);
        
        // Decode the base64 content to a buffer
        const buffer = Buffer.from(attachment.contentBytes, 'base64');
        console.log(`✓ Decoded ${buffer.length} bytes of binary data`);
        
        // Verify buffer is not empty
        if (buffer.length === 0) {
          throw new Error('Decoded buffer is empty - invalid base64 content');
        }
        
        // Prepare file object for S3 upload
        const file = {
          originalname: attachment.name,
          buffer: buffer,
          mimetype: attachment.contentType || 'application/octet-stream',
          size: buffer.length
        };
        
        // 3. UPLOAD TO S3
        try {
          console.log(`→ Uploading to S3 bucket: ${process.env.S3_BUCKET_NAME}...`);
          console.log(`Folder path: attachments/${desk_id}/incoming`);
          console.log(`File name: ${attachment.name}`);
          console.log(`MIME type: ${attachment.contentType || 'application/octet-stream'}`);
          console.log(`Buffer size: ${buffer.length} bytes`);
          
          // Ensure we have a valid buffer before upload
          if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            console.error(`❌ Invalid buffer for upload: ${typeof buffer}, length: ${buffer ? buffer.length : 'null'}`);
            throw new Error('Invalid buffer for S3 upload');
          }
          
          // Call S3 upload service
          const uploadedFile = await uploadFileToS3(file, `attachments/${desk_id}/incoming`);
          
          if (!uploadedFile || !uploadedFile.url) {
            throw new Error('S3 upload failed - no URL returned');
          }
          
          console.log(`✅ UPLOAD SUCCESSFUL: ${uploadedFile.url}`);
          
          // 4. GET S3 URL & STORE METADATA
          const attachmentMetadata = {
            name: attachment.name,
            originalName: attachment.name,
            url: uploadedFile.url, // This is the S3 URL
            contentType: attachment.contentType || 'application/octet-stream',
            size: attachment.size || buffer.length, // attachment.size is from Graph, buffer.length is actual decoded size
            s3Key: uploadedFile.s3Key,
            uploadTimestamp: new Date().toISOString(),
            contentId: attachment.contentId || null, // Add contentId, defaulting to null if not present
            isInline: attachment.isInline || false   // Add isInline, defaulting to false if not present
          };
          
          console.log('Attachment metadata prepared:', JSON.stringify(attachmentMetadata));
          
          // Add to results array
          s3UploadResults.push(attachmentMetadata);
        } catch (uploadError) {
          console.error(`❌ S3 UPLOAD ERROR:`, uploadError);
          throw uploadError;
        }
      } catch (attachErr) {
        console.error(`❌ Failed to process attachment ${attachment.name}:`, attachErr);
      }
    }
    
    // Check if any uploads were successful
    if (s3UploadResults.length === 0) {
      console.error('❌ No attachments were successfully uploaded to S3');
      return false;
    }
    
    console.log(`✅ Successfully uploaded ${s3UploadResults.length} of ${attachments.length} attachments to S3`);
    
    // STEP 5: SAVE EMAIL + URLS IN DB
    console.log('\n💾 STEP 5: SAVING ATTACHMENT URLS IN DATABASE');
    console.log(`Saving ${s3UploadResults.length} attachment URLs to the database`);
    
    // DEBUG: Log the complete attachment data structure we're about to save
    console.log('ATTACHMENT DATA TO SAVE:', JSON.stringify(s3UploadResults, null, 2));
    
    // Find existing message record
    console.log(`Looking up message with microsoft_message_id: ${messageId}`);
    const { data: messages, error: msgFindError } = await supabase
      .from('messages')
      .select('*')
      .eq('microsoft_message_id', messageId);
      
    if (msgFindError) {
      console.error(`❌ Database query error:`, msgFindError);
      return false;
    }
    
    if (!messages || messages.length === 0) {
      console.log(`⚠️ No message record found with microsoft_message_id: ${messageId}`);
      console.log(`→ Trying to find message by conversation ID instead...`);
      
      // Try to find by conversation ID if available
      if (email.conversationId) {
        console.log(`Searching by conversation ID: ${email.conversationId}`);
        const { data: convMessages, error: convErr } = await supabase
          .from('messages')
          .select('*')
          .eq('microsoft_conversation_id', email.conversationId)
          .order('created_at', { ascending: false });
          
        if (convErr) {
          console.error(`❌ Error searching by conversation ID:`, convErr);
          return false;
        }
          
        if (convMessages && convMessages.length > 0) {
          // Update the most recent message in this conversation
          const targetMessage = convMessages[0];
          console.log(`✅ Found message by conversation ID: ${targetMessage.id}`);
          
          // Print existing attachment URLs if any
          if (targetMessage.attachments_urls && targetMessage.attachments_urls.length > 0) {
            console.log(`Message already has ${targetMessage.attachments_urls.length} attachments`);
          }
          
          // Perform the database update
          console.log(`Updating message ${targetMessage.id} with attachment URLs...`);
          const attachmentUrlsToSave = s3UploadResults.map(att => att.url);
          console.log('Attachment URLs to save (conversationId path):', JSON.stringify(attachmentUrlsToSave));
          const { error: updateErr } = await supabase
            .from('messages')
            .update({ 
              attachments_urls: attachmentUrlsToSave, // Save only URLs
              has_attachments: true,
              microsoft_message_id: messageId // Update the message ID too
            })
            .eq('id', targetMessage.id);
          
          if (updateErr) {
            console.error(`❌ Failed to update message:`, updateErr);
            return false;
          }
          
          // Verify the update worked
          const { data: verifyData } = await supabase
            .from('messages')
            .select('attachments_urls')
            .eq('id', targetMessage.id)
            .single();
            
          if (verifyData && verifyData.attachments_urls) {
            console.log(`✅ Verified database update: ${verifyData.attachments_urls.length} attachments saved`);
          }
          
          console.log(`✅ SUCCESSFULLY UPDATED MESSAGE ${targetMessage.id} WITH ${s3UploadResults.length} ATTACHMENT URLS`);
          return true;
        } else {
          console.log(`⚠️ No messages found with conversation ID: ${email.conversationId}`);
        }
      }
      
      // If we reach here, we couldn't find a message to update
      console.error(`❌ Could not locate a message record to update with attachments`);
      return false;
    }
    
    // Update the message with attachment URLs
    const message = messages[0];
    console.log(`✅ Found message record directly: ID ${message.id}`);
    
    // Print existing attachment URLs if any
    if (message.attachments_urls && message.attachments_urls.length > 0) {
      console.log(`Message already has ${message.attachments_urls.length} attachments`);
    }
    
    // Perform the update
    console.log(`Updating message ${message.id} with attachment URLs...`);
    const attachmentUrlsToSave = s3UploadResults.map(att => att.url);
    console.log('Attachment URLs to save (messageId path):', JSON.stringify(attachmentUrlsToSave));
    const { error: updateError } = await supabase
      .from('messages')
      .update({ 
        attachments_urls: attachmentUrlsToSave, 
        has_attachments: true
      })
      .eq('id', message.id);
      
    // Verify the update worked
    if (!updateError) {
      const { data: verifyData } = await supabase
        .from('messages')
        .select('attachments_urls')
        .eq('id', message.id)
        .single();
        
      if (verifyData && verifyData.attachments_urls) {
        console.log(`✅ Verified database update: ${verifyData.attachments_urls.length} attachments saved`);
      }
    }
    
    if (updateError) {
      console.error(`❌ Failed to update message with attachment URLs:`, updateError);
      return false;
    }
    
    console.log('======================================================');
    console.log(`✅ ATTACHMENT PIPELINE COMPLETED SUCCESSFULLY`);
    console.log(`✅ UPDATED MESSAGE ${message.id} WITH ${s3UploadResults.length} ATTACHMENT URLS`);
    console.log('======================================================');
    
    return true;
  } catch (error) {
    console.error(`❌ ATTACHMENT PIPELINE FAILED:`, error);
    console.log('======================================================');
    return false;
  }
};

// Check if an incoming email is a reply to a closed ticket and should create a new ticket
const checkAndCreateNewTicketFromClosedReply = async (message, deskId) => {
  try {
    if (!message.microsoft_conversation_id || !message.in_reply_to_microsoft_id) {
      // Not a reply or no conversation ID, nothing to check
      return false;
    }
    
    // Check if the message is a reply to a closed conversation
    const { data: previousMessages, error: prevError } = await supabase
      .from('messages')
      .select('*')
      .eq('microsoft_conversation_id', message.microsoft_conversation_id)
      .eq('status', 'closed')
      .order('received_at', { ascending: false })
      .limit(5); // Get the latest messages from this conversation
      
    if (prevError) {
      console.error('Error checking previous messages:', prevError);
      return false;
    }
    
    // If we found closed messages in this conversation and the new message is a reply to one of them
    if (previousMessages && previousMessages.length > 0) {
      const repliedToClosedMessage = previousMessages.some(prevMsg => 
        prevMsg.microsoft_message_id === message.in_reply_to_microsoft_id ||
        message.body_html?.includes('Your ticket has been resolved') ||
        message.body_preview?.includes('Your ticket has been resolved')
      );
      
      if (repliedToClosedMessage) {
        console.log(`Message ${message.microsoft_message_id} is a reply to a closed ticket. Creating new ticket...`);
        
        // Create a new ticket
        const { data: newTicket, error: ticketError } = await supabase
          .from('tickets')
          .insert({
            desk_id: deskId,
            subject: message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`,
            description: message.body_preview || 'Reply to closed ticket',
            status: 'open',
            priority: 'medium',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            email: message.from_address,
            customer_name: message.from_name,
            reopened_from_closed: true,
            previous_conversation_id: message.microsoft_conversation_id
          })
          .select()
          .single();
          
        if (ticketError) {
          console.error('Error creating new ticket:', ticketError);
          return false;
        }
        
        // Update this message to be part of a new conversation (will happen through MS Graph API later)
        // and associate it with the new ticket
        const { error: updateError } = await supabase
          .from('messages')
          .update({ 
            status: 'open',
            ticket_id: newTicket.id
          })
          .eq('id', message.id);
          
        if (updateError) {
          console.error('Error updating message for new ticket:', updateError);
          return false;
        }
        
        console.log(`Created new ticket ${newTicket.id} from reply to closed conversation ${message.microsoft_conversation_id}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error in checkAndCreateNewTicketFromClosedReply:', error);
    return false;
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
    // Get status filter - either 'open' or 'closed' (default to 'open')
    const statusFilter = req.query.status || 'open';
    
    console.log(`Received request for ${statusFilter} emails with conversation view. Query params:`, req.query);
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    console.log(`Fetching ${statusFilter} emails for desk:`, deskId);
    
    // Fetch messages from local DB
    try {
      // Get user ID and role from request
      const userId = req.userId;
      const userRole = req.userRole;
      console.log(`[EmailCtrl] User ID: ${userId}, Role: ${userRole}`);
      
      // Build base query with status filter
      let query = supabase
        .from('messages')
        .select('*')
        .eq('desk_id', deskId)
        .eq('status', statusFilter) // Filter by open or closed status
        .order('received_at', { ascending: false }); // Get most recent messages first
        
      // If the user is not an admin or supervisor, filter by assigned_to_user_id
      // Admins and supervisors can see all messages
      if (userRole !== 'admin' && userRole !== 'supervisor') {
        console.log(`[EmailCtrl] Filtering messages for agent ${userId}`);
        query = query.or(`assigned_to_user_id.eq.${userId},assigned_to_user_id.is.null`);
      } else {
        console.log(`[EmailCtrl] Admin/supervisor ${userId} can see all messages`);
      }
      
      const { data: dbMessages, error: dbError } = await query.limit(MESSAGE_FETCH_LIMIT);

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
            attachments: m.attachments_urls || [] // Include attachments_urls field from the message table
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
    const identifier = req.params.ticketId; // This can be microsoft_message_id or microsoft_conversation_id
    console.log('[fetchConversation] Received identifier:', identifier);

    if (!identifier) {
      return res.status(400).json({ message: 'Identifier (microsoft_message_id or microsoft_conversation_id) is required' });
    }

    let targetConversationId = null;

    // Heuristic: Microsoft Message IDs are often long and start with 'AAMk...'
    // User's custom conversation IDs might be like 'email-123'
    // This check might need refinement based on actual ID patterns
    const isLikelyMicrosoftMessageId = identifier.startsWith('AAMk') || identifier.length > 100; // Adjust length as needed

    if (isLikelyMicrosoftMessageId) {
      console.log(`[fetchConversation] Identifier '${identifier}' looks like a Microsoft Message ID. Fetching its conversation ID.`);
      const { data: messageData, error: msgError } = await supabase
        .from('messages')
        .select('microsoft_conversation_id')
        .eq('microsoft_message_id', identifier)
        .single();

      if (msgError || !messageData) {
        console.error(`[fetchConversation] Error fetching message by microsoft_message_id '${identifier}':`, msgError?.message || 'Not found');
        return res.status(404).json({ message: `Message not found for microsoft_message_id: ${identifier}` });
      }
      targetConversationId = messageData.microsoft_conversation_id;
      if (!targetConversationId) {
        console.error(`[fetchConversation] Message '${identifier}' found, but it has no microsoft_conversation_id.`);
        return res.status(404).json({ message: `Conversation ID missing for message: ${identifier}` });
      }
      console.log(`[fetchConversation] Derived microsoft_conversation_id '${targetConversationId}' from microsoft_message_id '${identifier}'.`);
    } else {
      targetConversationId = identifier;
      console.log(`[fetchConversation] Identifier '${identifier}' assumed to be a direct microsoft_conversation_id.`);
    }

    // Now fetch all messages for the targetConversationId
    console.log(`[fetchConversation] Fetching all messages for microsoft_conversation_id: '${targetConversationId}'`);
    let messagesQuery = supabase
      .from('messages')
      .select('*')
      .eq('microsoft_conversation_id', targetConversationId);

    // Apply role-based filtering
    const userId = req.userId;
    const userRole = req.userRole;
    console.log(`[fetchConversation] User ID: ${userId}, Role: ${userRole}`);

    if (userRole !== 'admin' && userRole !== 'supervisor') {
      console.log(`[fetchConversation] Filtering messages for agent ${userId} based on assigned_to_user_id.`);
      messagesQuery = messagesQuery.or(`assigned_to_user_id.eq.${userId},assigned_to_user_id.is.null`);
    } else {
      console.log(`[fetchConversation] Admin/supervisor ${userId} can see all messages for this conversation.`);
    }

    const { data: messages, error: messagesError } = await messagesQuery.order('created_at', { ascending: true });

    if (messagesError) {
      console.error(`[fetchConversation] Error fetching messages for microsoft_conversation_id '${targetConversationId}':`, messagesError.message);
      return res.status(500).json({ message: `Error fetching messages: ${messagesError.message}` });
    }

    if (!messages || messages.length === 0) {
      console.log(`[fetchConversation] No messages found for microsoft_conversation_id '${targetConversationId}'.`);
      // Depending on requirements, could return 404 or empty array. Returning empty for now.
      return res.status(200).json([]); 
    }

    console.log(`[fetchConversation] Found ${messages.length} messages for microsoft_conversation_id '${targetConversationId}'.`);

    // Process messages (similar to previous, but without ticket-specific initial message)
    const processedConversation = messages.map(message => ({
      ...message,
      fromName: message.from_name || message.from_address, // Updated from sender_name/sender_email to match schema
      type: message.is_internal ? 'internal_note' : (message.direction === 'outgoing' ? 'reply' : 'customer_message'), // Example type logic
    }));

    console.log('[fetchConversation] Returning processed conversation with', processedConversation.length, 'messages.');
    return res.status(200).json(processedConversation);

  } catch (error) {
    console.error('[fetchConversation] Unhandled error:', error);
    return res.status(500).json({ message: error.message || 'Error fetching conversation' });
  }
};
// Download S3 attachment
exports.downloadS3Attachment = async (req, res) => {
  try {
    const { s3Key } = req.query;
    // const desk_id = extractDeskId(req); // Available if needed for logging or validation

    if (!s3Key) {
      console.warn('[email.controller] downloadS3Attachment: s3Key parameter is missing.');
      return res.status(400).json({ message: 'S3 key is required.' });
    }

    console.log(`[email.controller] Attempting to download S3 attachment with key: ${s3Key}`);

    // Query for messages where attachments_urls contains an object with the given s3Key.
    // The '??' operator checks if a JSONB string (s3Key) exists as a key in any of the objects within the attachments_urls array.
    // This is a more robust way to query than trying to match the whole object.
    // Supabase/Postgres: SELECT * FROM messages WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(attachments_urls) AS elem WHERE elem->>'s3Key' = 'your_key');
    // We'll use a simpler Supabase filter first, and if it's not efficient enough, consider an RPC.
    const { data: messages, error: dbError } = await supabase
      .from('messages')
      .select('attachments_urls, desk_id') // desk_id for potential validation
      .filter('attachments_urls', 'cs', `[{"s3Key":"${s3Key}"}]`); // 'cs' checks if JSONB contains the specified JSONB
      // A more precise query might be needed if this is too broad or inefficient.
      // For instance, using a function or ensuring the s3Key is unique across all attachments.

    if (dbError) {
      console.error('[email.controller] Error fetching message for S3 attachment:', dbError);
      return res.status(500).json({ message: 'Error fetching attachment details.' });
    }

    if (!messages || messages.length === 0) {
      console.warn(`[email.controller] No message found potentially containing S3 key: ${s3Key} using .filter 'cs'`);
      // Attempt a broader search if the first one fails, then filter in JS (less efficient but a fallback)
      // This part is more complex and depends on how s3Keys are structured and if they can appear in multiple messages.
      // For now, we assume the above query is sufficient or we find the first match.
      return res.status(404).json({ message: 'Attachment metadata not found (no matching message).' });
    }

    let attachmentMeta = null;
    let messageDeskId = null;

    for (const message of messages) {
      if (message.attachments_urls && Array.isArray(message.attachments_urls)) {
        const foundAtt = message.attachments_urls.find(att => att.s3Key === s3Key);
        if (foundAtt) {
          attachmentMeta = foundAtt;
          messageDeskId = message.desk_id; // Store desk_id of the message for context
          break;
        }
      }
    }

    if (!attachmentMeta) {
      console.warn(`[email.controller] S3 key ${s3Key} not found in attachments_urls of any queried message.`);
      return res.status(404).json({ message: 'Attachment metadata not found in message details.' });
    }
    
    // Optional: Validate if the attachment's message desk_id matches user's current desk_id if necessary for security
    // const requestingDeskId = extractDeskId(req);
    // if (requestingDeskId && messageDeskId && String(messageDeskId) !== String(requestingDeskId)) {
    //   console.warn(`[email.controller] Security: Attempt to access attachment ${s3Key} from desk ${messageDeskId} by user from desk ${requestingDeskId}`);
    //   return res.status(403).json({ message: 'Access to this attachment is forbidden.' });
    // }

    const s3ObjectStream = getS3ObjectStream(s3Key);

    // Set the Content-Type header based on attachment metadata
    res.setHeader('Content-Type', attachmentMeta.contentType || 'application/octet-stream');
    
    // Fix for ERR_INVALID_CHAR: URL encode the filename to ensure it's safe for HTTP headers
    // RFC 6266 format for international filenames using UTF-8 encoding
    const safeFilename = encodeURIComponent(attachmentMeta.name || path.basename(s3Key));
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    if (attachmentMeta.size) {
      res.setHeader('Content-Length', attachmentMeta.size.toString());
    }

    s3ObjectStream.on('error', (s3Error) => {
      console.error(`[email.controller] Error streaming S3 object ${s3Key}:`, s3Error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming file from S3.' });
      }
    });

    s3ObjectStream.pipe(res);

  } catch (error) {
    console.error('[email.controller] Unexpected error in downloadS3Attachment:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to download attachment due to an unexpected error.' });
    }
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


