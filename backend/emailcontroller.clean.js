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

// Send an email for a ticket using Microsoft Graph API
exports.sendEmail = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content, is_internal, update_status, recipients } = req.body;
    
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
    
    // Get access token for Microsoft Graph API
    const accessToken = await exports.getMicrosoftAccessToken(ticket.desk_id);
    
    // Prepare email using Microsoft Graph API
    const emailRecipients = recipients && recipients.length > 0 ? 
      recipients : [{ emailAddress: { address: ticket.customer_email } }];
    
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
    const deskId = req.query.deskId;
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    // Get access token for Microsoft Graph API
    const accessToken = await exports.getMicrosoftAccessToken(deskId);
    
    // Fetch emails from Microsoft Graph API
    const emailsResponse = await axios.get(
      'https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=id,subject,bodyPreview,from,receivedDateTime,hasAttachments,importance,isRead', 
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return res.status(200).json(emailsResponse.data.value);
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



// Reply directly to an email using Microsoft Graph API
exports.replyToEmail = async (req, res) => {
  try {
    const { emailId } = req.params;
    const { content, deskId } = req.body;
    
    if (!emailId) {
      return res.status(400).json({ message: 'Email ID is required' });
    }
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    if (!content) {
      return res.status(400).json({ message: 'Reply content is required' });
    }
    
    console.log(`Replying to email ${emailId} for desk ${deskId}`);
    
    // Get email details to extract recipient information
    const accessToken = await exports.getMicrosoftAccessToken(deskId);
    const axios = require('axios');
    
    try {
      // Get the original message to extract sender info
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
      const sender = originalMessage.sender || originalMessage.from;
      const recipientEmail = sender.emailAddress ? sender.emailAddress.address : '';

      // Compose reply
      const subject = originalMessage.subject.startsWith('RE:') ? originalMessage.subject : `RE: ${originalMessage.subject}`;

      console.log(`Sending reply to '${recipientEmail}' for email ${emailId}`);

      // Send reply via Microsoft Graph API
      const replyData = {
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail
              }
            }
          ]
        },
        saveToSentItems: true
      };



      const replyResponse = await axios.post(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}/reply`,
        replyData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Mark original email as read
      await axios.patch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
        {
          isRead: true
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`Successfully replied to email ${emailId}`);
      return res.status(200).json({ message: 'Email reply sent successfully' });
    } catch (error) {
      console.error('Error replying to email:', error.response?.data || error.message);
      return res.status(500).json({ message: error.response?.data?.message || error.message || 'Error replying to email' });
    }
    }
  } catch (error) {
    console.error('Error in replyToEmail:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};


