const EmailService = require('../utils/email.service');
const Ticket = require('../models/ticket.model');
const Desk = require('../models/desk.model');
const Message = require('../models/message.model');
const { uploadFileToS3 } = require('../services/s3.service');
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
    console.log(`Processing ${attachments?.length || 0} attachments for email reply`);
    
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

      const messageDataForDb = {
        desk_id,
        ticket_id: null, // Not applicable for direct replies
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
        is_read_on_server: true, // It's an outgoing message
        sender_id: req.userId, // Internal user ID of the agent who replied
        attachments_urls: s3AttachmentUrls, // Store S3 URLs in the database
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
        
        <div style="margin: 30px 0; text-align: center; display: flex; justify-content: center; align-items: center;">
          <a href="http://${process.env.BACKEND_URL || 'localhost:3001'}/api/feedback/submit?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=positive" style="text-decoration: none; margin: 0 15px; display: inline-block; width: 100px;">
            <span style="font-size: 32px; display: block;">😃</span>
            <p style="margin-top: 5px;">Great!</p>
          </a>
          
          <a href="http://${process.env.BACKEND_URL || 'localhost:3001'}/api/feedback/submit?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=neutral" style="text-decoration: none; margin: 0 15px; display: inline-block; width: 100px;">
            <span style="font-size: 32px; display: block;">😐</span>
            <p style="margin-top: 5px;">Okay</p>
          </a>
          
          <a href="http://${process.env.BACKEND_URL || 'localhost:3001'}/api/feedback/submit?ticketId=${originalMessage.conversationId}&messageId=${originalMessage.id}&rating=negative" style="text-decoration: none; margin: 0 15px; display: inline-block; width: 100px;">
            <span style="font-size: 32px; display: block;">😞</span>
            <p style="margin-top: 5px;">Not satisfied</p>
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
    
    // Wait a moment for the resolution email to be processed by Microsoft Graph API
    console.log(`Waiting briefly for the resolution email to be processed...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now update message statuses in the database, AFTER sending the resolution email
    // This ensures the feedback/resolution email is also included in database fetch operations
    try {
      if (!originalMessage.conversationId) {
        console.warn(`Cannot update conversation messages: conversationId is missing for email ${emailId}. Using only the specific message ID for updates.`);
        
        // If no conversationId, at least update the specific message
        const { error: singleMessageError } = await supabase
          .from('messages')
          .update({ status: 'closed' })
          .eq('microsoft_message_id', emailId);

        if (singleMessageError) {
          console.error(`Error updating status for specific message ${emailId}:`, singleMessageError);
          // If there's a Supabase API key error, log it clearly
          if (singleMessageError.message?.includes('Invalid API key')) {
            console.error('CRITICAL ERROR: Supabase Invalid API key detected. Please check your Supabase configuration.');
          }
        } else {
          console.log(`Successfully updated status to closed for message ${emailId}`);
        }
        
        return res.status(200).json({ message: 'Ticket resolved successfully but conversation update was limited.' });
      }
      
      console.log(`Attempting to fetch ALL messages for conversation ID: ${originalMessage.conversationId}`);
      
      // First, fetch all messages for this conversation to confirm what needs updating
      const { data: allConversationMessages, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('microsoft_conversation_id', originalMessage.conversationId);

      if (fetchError) {
        console.error(`Error fetching messages for conversation ${originalMessage.conversationId}:`, fetchError);
        // Check for API key errors
        if (fetchError.message?.includes('Invalid API key')) {
          console.error('CRITICAL ERROR: Supabase Invalid API key detected. Please check your Supabase configuration.');
        }
      } else {
        console.log(`Found ${allConversationMessages?.length || 0} messages in conversation to update`);
      }
      
      // Now update ALL messages in this conversation
      console.log(`Updating status to 'closed' for ALL messages in conversation: ${originalMessage.conversationId}`);
      const { data: updateData, error: conversationMessagesError } = await supabase
        .from('messages')
        .update({ status: 'closed' })
        .eq('microsoft_conversation_id', originalMessage.conversationId)
        .select(); // Get back the updated records

      if (conversationMessagesError) {
        console.error(`Error updating status for conversation ${originalMessage.conversationId}:`, conversationMessagesError);
        // Check for API key errors again
        if (conversationMessagesError.message?.includes('Invalid API key')) {
          console.error('CRITICAL ERROR: Supabase Invalid API key detected. Please check your Supabase configuration.');
        }
        return res.status(500).json({ message: 'Error updating message statuses', error: conversationMessagesError });
      } else {
        const updatedCount = updateData?.length || 0;
        console.log(`Successfully updated status to 'closed' for ${updatedCount} messages in conversation ${originalMessage.conversationId}`);
        
        // If no records were updated, this is suspicious - log it
        if (updatedCount === 0) {
          console.warn(`WARNING: No messages were updated to 'closed' status, even though we found ${allConversationMessages?.length || 0} messages in this conversation. Check if all messages were already closed or if there's a database connectivity issue.`);
        }
      }
    } catch (dbError) {
      console.error('General error during database operations for message status update:', dbError);
      return res.status(500).json({ message: 'Error updating message statuses', error: dbError.message || 'Unknown error' });
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
        status: 'closed' // Explicitly mark the feedback email as closed right from creation
      };

      await Message.logMessage(messageDataForDb);
      console.log(`[EmailCtrl] Successfully logged resolution email for ticket with original email ${emailId} to DB.`);

    } catch (dbError) {
      console.error(`[EmailCtrl] Failed to log resolution email to database:`, dbError.message, dbError.stack);
      // Do not fail the operation if DB logging fails
    }
    
    // Before sending the final response, perform one more database update with a longer delay
    // This will catch any new messages (like the feedback email) that arrived during our processing
    try {
      console.log(`Setting up final conversation update in 5 seconds to catch feedback email...`);
      
      // Schedule a delayed update with higher timeout to catch any new messages in this conversation
      setTimeout(async () => {
        try {
          if (!originalMessage.conversationId) {
            console.log('No conversation ID available for final update, skipping.');
            return;
          }

          console.log(`Executing final update for conversation ${originalMessage.conversationId} to catch feedback email...`);
          
          // Final update to catch the feedback email that might have arrived after the initial updates
          const { data: finalUpdateData, error: finalUpdateError } = await supabase
            .from('messages')
            .update({ status: 'closed' })
            .eq('microsoft_conversation_id', originalMessage.conversationId)
            .select();
            
          if (finalUpdateError) {
            console.error('Final update error:', finalUpdateError);
            if (finalUpdateError.message?.includes('Invalid API key')) {
              console.error('CRITICAL ERROR: Supabase Invalid API key detected in final update.');
            }
          } else {
            const updatedCount = finalUpdateData?.length || 0;
            console.log(`Final update complete - updated ${updatedCount} messages to 'closed'.`);
            
            // Quick verification check to see if any messages in this conversation are still 'open'
            const { data: openMsgs, error: checkError } = await supabase
              .from('messages')
              .select('microsoft_message_id')
              .eq('microsoft_conversation_id', originalMessage.conversationId)
              .eq('status', 'open');
              
            if (checkError) {
              console.error('Error checking for remaining open messages:', checkError);
            } else if (openMsgs && openMsgs.length > 0) {
              console.warn(`ALERT: ${openMsgs.length} messages in this conversation are still marked as 'open' after final update.`);
              console.warn('Message IDs still open:', openMsgs.map(m => m.microsoft_message_id).join(', '));
            } else {
              console.log('Success! All messages in this conversation are now closed.');
            }
          }
        } catch (finalError) {
          console.error('Error in final conversation update:', finalError);
        }
      }, 5000); // 5 second delay to ensure feedback email is received and stored
      
    } catch (finalError) {
      console.error('Error setting up final update:', finalError);
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
    console.log('====================================================');
    console.log('📨 INCOMING EMAIL WEBHOOK NOTIFICATION RECEIVED');
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
      console.log('⚡ Starting async processing of notifications...');
      
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
  try {
    console.log('===========================================================');
    console.log(`📥 PROCESSING ${notifications.length} WEBHOOK NOTIFICATIONS`);
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
      console.log(`✅ Found desk: ${desk_id}`);
      
      // Get message details
      if (resourceData.id) {
        console.log(`📧 Processing message: ${resourceData.id}`);
        const result = await processNewIncomingEmail(resourceData.id, desk_id);
        console.log(`📝 Message processing result: ${result ? 'Success' : 'Failed'}`);
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
  console.log('======================================================');
  console.log(`🔄 STARTING INCOMING EMAIL ATTACHMENT PIPELINE`);
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
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const email = msgResponse.data;
    console.log(`✓ Email fetched - Subject: "${email.subject}"`);
    console.log(`✓ From: ${email.from?.emailAddress?.address || 'Unknown'}`);
    console.log(`✓ Has attachments: ${email.hasAttachments ? 'Yes' : 'No'}`);
    
    // If no attachments, exit early
    if (!email.hasAttachments) {
      console.log('\n⚠️ No attachments in this email. Skipping attachment processing.');
      return true;
    }
    
    // STEP 2: PARSE ATTACHMENTS (BASE64)
    console.log('\n📦 STEP 2: PARSING ATTACHMENTS FROM EMAIL');
    
    // Get attachment metadata and content
    const attachmentsResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const attachments = attachmentsResponse.data.value;
    if (!attachments || attachments.length === 0) {
      console.log('⚠️ No attachments found in response despite hasAttachments flag');
      return true;
    }
    
    console.log(`✓ Found ${attachments.length} attachments:`);
    attachments.forEach((att, i) => {
      console.log(`  ${i+1}) ${att.name} (${att.contentType}, ${att.size || 'unknown'} bytes)`);
    });
    
    // STEP 3: UPLOAD TO S3 (NO ACL)
    console.log('\n☁️ STEP 3: UPLOADING ATTACHMENTS TO S3');
    
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
            url: uploadedFile.url,
            contentType: attachment.contentType || 'application/octet-stream',
            size: attachment.size || buffer.length,
            s3Key: uploadedFile.s3Key,
            uploadTimestamp: new Date().toISOString()
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
          const { error: updateErr } = await supabase
            .from('messages')
            .update({ 
              attachments_urls: s3UploadResults,
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
    const { error: updateError } = await supabase
      .from('messages')
      .update({ 
        attachments_urls: s3UploadResults,
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
      // Build query with status filter
      const { data: dbMessages, error: dbError } = await supabase
        .from('messages')
        .select('*')
        .eq('desk_id', deskId)
        .eq('status', statusFilter) // Filter by open or closed status
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


