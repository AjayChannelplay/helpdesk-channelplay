const EmailService = require('../utils/email.service');
const Ticket = require('../models/ticket.model');
const Desk = require('../models/desk.model');
const Message = require('../models/message.model');
const { supabase } = require('../config/db.config');
const axios = require('axios');

// Helper function to get Microsoft Graph API access token for a desk
exports.getMicrosoftAccessToken = async function(deskId) {
  try {
    console.log('Getting Microsoft access token for desk:', deskId);
    
    // Get integration details for the desk
    const { data: integration, error } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', deskId)
      .single();
    
    console.log('Integration fetch result:', error ? 'Error' : 'Success');
    
    if (error) {
      console.error('Integration fetch error:', error.message);
      throw new Error(`No email integration found for this desk: ${error.message}`);
    }
    
    if (!integration) {
      console.error('No integration data found for desk ID:', deskId);
      throw new Error('No email integration found for this desk');
    }
    
    console.log('Integration found:', { 
      id: integration.id,
      desk_id: integration.desk_id,
      provider: integration.provider,
      hasAccessToken: !!integration.access_token,
      hasRefreshToken: !!integration.refresh_token
    });
    
    if (!integration.access_token) {
      throw new Error('Access token not available. Please authenticate with Microsoft.');
    }
    
    // Check if token is expired
    const tokenExpiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    
    if (now >= tokenExpiresAt) {
      // Token is expired, refresh it
      if (!integration.refresh_token) {
        throw new Error('Refresh token not available. Please re-authenticate with Microsoft.');
      }
      
      // Exchange refresh token for new access token
      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: integration.client_id,
          client_secret: integration.client_secret,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
          scope: 'Mail.Read Mail.Send offline_access User.Read'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      // Update integration with new tokens
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Calculate new expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
      
      await supabase
        .from('email_integrations')
        .update({
          access_token,
          refresh_token,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);
      
      return access_token;
    }
    
    return integration.access_token;
  } catch (error) {
    console.error('Error getting Microsoft access token:', error);
    throw error;
  }
}

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
    const accessToken = await exports.getMicrosoftAccessToken(desk_id);
    
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
    const accessToken = await exports.getMicrosoftAccessToken(desk_id);
    
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
    const accessToken = await exports.getMicrosoftAccessToken(desk_id);
    
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
  try {
    // Check for both parameter formats (deskId and desk_id) for better compatibility
    const deskId = req.query.deskId || req.query.desk_id;
    console.log('Received request for all emails. Query params:', req.query);
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    console.log('Fetching all emails for desk:', deskId);
    
    // Get access token for Microsoft Graph API
    const accessToken = await exports.getMicrosoftAccessToken(deskId);
    console.log('Access token retrieved successfully');
    
    // Fetch both read and unread emails from Microsoft Graph API
    try {
      console.log('Calling Microsoft Graph API to fetch all emails...');
      
      // Add parameters to sort by receivedDateTime desc to get newest first
      const emailsResponse = await axios.get(
        'https://graph.microsoft.com/v1.0/me/messages?$top=100&$select=id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,hasAttachments,importance,isRead,conversationId&$orderby=receivedDateTime desc', 
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Microsoft Graph API response received, emails count:', emailsResponse.data.value?.length || 0);
      
      // Group emails by conversation ID
      const conversationMap = {};
      emailsResponse.data.value.forEach(email => {
        if (!conversationMap[email.conversationId]) {
          conversationMap[email.conversationId] = [];
        }
        
        // If email has attachments, fetch basic attachment info
        if (email.hasAttachments) {
          // Mark for attachment info fetching later
          email.needsFetchAttachments = true;
        }
        
        conversationMap[email.conversationId].push(email);
      });
      
      // Sort emails within each conversation by date
      Object.keys(conversationMap).forEach(conversationId => {
        conversationMap[conversationId].sort((a, b) => {
          return new Date(a.receivedDateTime) - new Date(b.receivedDateTime);
        });
      });
      
      // Now create a structure of conversation threads instead of individual emails
      const conversations = [];
      
      // Fetch attachment info for emails that need it
      for (const conversationId of Object.keys(conversationMap)) {
        const messagesInConversation = conversationMap[conversationId];
        
        for (const email of messagesInConversation) {
          if (email.needsFetchAttachments) {
            try {
              // Fetch attachment info
              const attachmentsResponse = await axios.get(
                `https://graph.microsoft.com/v1.0/me/messages/${email.id}/attachments`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              // Add attachment info to email
              email.attachments = attachmentsResponse.data.value;
              delete email.needsFetchAttachments;
            } catch (attachmentError) {
              console.error(`Error fetching attachments for email ${email.id}:`, attachmentError.message);
              email.attachments = [];
              delete email.needsFetchAttachments;
            }
          }
        }
      }
      
      Object.keys(conversationMap).forEach(conversationId => {
        const messagesInConversation = conversationMap[conversationId];
        // Use the latest message as the conversation representative
        const latestMessage = messagesInConversation[messagesInConversation.length - 1];
        const firstMessage = messagesInConversation[0];
        
        // Check if any message in the conversation is unread
        const hasUnread = messagesInConversation.some(msg => !msg.isRead);
        
        conversations.push({
          id: conversationId,
          subject: latestMessage.subject,
          preview: latestMessage.bodyPreview || 'No preview available',
          fromName: latestMessage.from?.emailAddress?.name || latestMessage.from?.emailAddress?.address,
          receivedDateTime: latestMessage.receivedDateTime,
          hasUnread: hasUnread,
          messageCount: messagesInConversation.length,
          messages: messagesInConversation.map(msg => ({
            id: msg.id,
            subject: msg.subject,
            bodyPreview: msg.bodyPreview,
            body: msg.body,
            from: msg.from,
            fromName: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address,
            receivedDateTime: msg.receivedDateTime,
            isRead: msg.isRead
          })),
          latestMessageId: latestMessage.id,
          firstMessageId: firstMessage.id
        });
      });
      
      // Sort conversations by the date of their latest message
      conversations.sort((a, b) => {
        return new Date(b.receivedDateTime) - new Date(a.receivedDateTime);
      });
      
      return res.status(200).json(conversations);
    } catch (apiError) {
      console.error('Error calling Microsoft Graph API:', apiError.message);
      if (apiError.response) {
        console.error('API response status:', apiError.response.status);
        console.error('API response data:', apiError.response.data);
      }
      throw apiError;
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
    const accessToken = await exports.getMicrosoftAccessToken(deskId);
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
    const accessToken = await exports.getMicrosoftAccessToken(deskId);
    
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


