const Ticket = require('../models/ticket.model');
const Message = require('../models/message.model');
const Desk = require('../models/desk.model');
const EmailService = require('../utils/email.service');
const emailController = require('./email.controller'); // Import email controller for resolveTicket
const { supabase } = require('../config/db.config'); // Add supabase client import
const { generateFeedbackEmailHTML, generateNewTicketAckEmailHTML } = require('../utils/emailTemplates');
const { v4: uuidv4 } = require('uuid');
//const EmailService = require('../utils/email.service');
//const Desk = require('../models/desk.model');

// Initialize Supabase Realtime subscription for new tickets
const setupTicketAcknowledgmentListener = () => {
  console.log('Setting up Supabase Realtime listener for new tickets...');
  
  const subscription = supabase
    .channel('ticket_inserts')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'tickets'
    }, async (payload) => {
      try {
        console.log('New ticket created via Realtime:', payload.new);
        await exports.sendTicketAcknowledgment(payload.new);
      } catch (error) {
        console.error('Error in ticket acknowledgment:', error);
      }
    })
    .subscribe();
  
  return subscription;
};

// Call this function when your application starts
let ticketSubscription;
if (process.env.NODE_ENV !== 'test') {
  ticketSubscription = setupTicketAcknowledgmentListener();
}

// Send acknowledgment email for a new ticket
exports.sendTicketAcknowledgment = async (ticket) => {
  try {
    console.log(`Sending acknowledgment for ticket ${ticket.id}`);
    
    // Get desk information
    const desk = await Desk.findById(ticket.desk_id);
    if (!desk) {
      throw new Error(`Desk not found for ID: ${ticket.desk_id}`);
    }
    
    // Initialize email service for the desk
    const emailService = new EmailService(desk);
    await emailService.init();
    
    // Generate email content
    const customerName = ticket.from_name || 'Valued Customer';
    const ticketDisplayId = ticket.user_ticket_id || ticket.id;
    let determinedDeskName = 'Our Support Team'; // Default value
    if (desk && desk.name && typeof desk.name === 'string' && desk.name.trim() !== '') {
      determinedDeskName = desk.name.trim();
    }
    const emailHtmlContent = generateNewTicketAckEmailHTML(customerName, ticketDisplayId, determinedDeskName);
    
    // Send the email
    await emailService.sendEmail({
      to: ticket.from_address,
      subject: `RE: ${ticket.subject || 'Your support ticket'}`,
      htmlBody: emailHtmlContent,  // Use htmlBody instead of body
      inReplyTo: ticket.initial_message_graph_id || ticket.conversation_id,
      references: ticket.conversation_id
    });
    
    console.log(`Acknowledgment email sent for ticket ${ticket.id}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending ticket acknowledgment:', error);
    throw error;
  }
};

// Create a new ticket
exports.createTicket = async (req, res) => {
  try {
    // Create ticket
    const newTicket = await Ticket.create({
      subject: req.body.subject,
      description: req.body.description,
      priority: req.body.priority || 'medium',
      status: 'new',
      desk_id: req.body.desk_id,
      created_by: req.userId,
      assigned_to: req.body.assigned_to,
      customer_email: req.body.customer_email
    });
    
    // Create initial message if description is provided
    if (req.body.description) {
      await Message.create({
        ticket_id: newTicket.id,
        sender_id: req.userId,
        content: req.body.description,
        is_internal: false
      });
    }
    
    // Return the new ticket
    res.status(201).json({
      message: 'Ticket created successfully',
      ticket: newTicket
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error creating ticket',
      error: error.message 
    });
  }
};

// Get all tickets
exports.getTickets = async (req, res) => {
  try {
    // Import supabase from db.config.js
    const { supabase } = require('../config/db.config');
    
    // Build the query using Supabase
    let query = supabase.from('tickets').select('*');
    
    // Apply filters if provided
    if (req.query.status) {
      if (req.query.status === 'open') {
        // If 'open' is requested, include 'open', 'new', and 'reopen' statuses
        query = query.in('status', ['open', 'new', 'reopen']);
      } else {
        // For other statuses (e.g., 'closed'), use exact match
        query = query.eq('status', req.query.status);
      }
    }
    
    // Check for desk_id parameter from frontend
    if (req.query.desk_id) {
      query = query.eq('desk_id', req.query.desk_id);
    }
    
    if (req.query.assigned_to) {
      query = query.eq('assigned_to', req.query.assigned_to);
    }
    
    // Role-based filtering: agents can only see tickets assigned to them
    // While admins/supervisors can see all tickets
    const userId = req.userId;
    const userRole = req.userRole;
    
    console.log(`User ${userId} with role ${userRole} requesting tickets`);
    
    // If the user is not an admin or supervisor, filter by assigned_to_user_id
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      console.log(`Filtering tickets for agent ${userId}`);
      query = query.eq('assigned_to_user_id', userId);
    }
    
    // Execute the query
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Error finding tickets: ${error.message}`);
    }
    
    console.log(`Found ${data?.length || 0} tickets for user ${userId}`);
    res.status(200).json({ data });
  } catch (error) {
    console.error('Error in getTickets:', error);
    res.status(500).json({ 
      message: 'Error getting tickets',
      error: error.message 
    });
  }
};

// Get ticket by ID
exports.getTicketById = async (req, res) => {
  try {
    // Get ticket
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Get messages for the ticket
    const messages = await Message.findByTicketId(req.params.id);
    
    res.status(200).json({ 
      ticket,
      messages 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error getting ticket',
      error: error.message 
    });
  }
};

// Update ticket
exports.updateTicket = async (req, res) => {
  try {
    // Check if ticket exists
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Check if status is changing to closed
    //console.log("New Result are )))))----00000000",ticket.status)
    const statusChangingToClosed = req.body.status === 'closed' && ticket.status !== 'closed';
    
    // Update ticket
    const updatedTicket = await Ticket.update(req.params.id, {
      subject: req.body.subject || ticket.subject,
      description: req.body.description || ticket.description,
      priority: req.body.priority || ticket.priority,
      status: req.body.status || ticket.status,
      desk_id: req.body.desk_id || ticket.desk_id,
      assigned_to_user_id: req.body.assigned_to_user_id || req.body.assigned_to || ticket.assigned_to_user_id,
      conversation_id: ticket.conversation_id // Ensure conversation_id is preserved
    });
    
    // Create internal note about the update if requested
    //console.log("Updating ticketing data are -------********",updatedTicket)
    if (req.body.add_internal_note || statusChangingToClosed) {
      await Message.create({
        ticket_id: req.params.id,
        sender_id: req.userId,
        content: req.body.update_note || `Ticket status changed to ${req.body.status || ticket.status}`,
        is_internal: true,
        microsoft_conversation_id: ticket.conversation_id // Ensure internal note is linked to the ticket's conversation
      });
    }
    
    // Send feedback email if ticket is being closed
    if (statusChangingToClosed) {
      try {
        console.log(`Ticket ${ticket.id} status changed to closed, sending feedback email`);

        // Get the most recent customer message to send feedback email to
        const { data: recentMessages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('ticket_id', ticket.id)
          .eq('direction', 'incoming')
          .order('created_at', { ascending: false })
          .limit(1);

        if (messagesError) {
          console.error('Error fetching recent messages:', messagesError);
        } else if (recentMessages && recentMessages.length > 0) {
          const recentMessage = recentMessages[0];

          console.log(`Found recent message with ID ${recentMessage.microsoft_message_id || recentMessage.id}`);

          // Use the emailController directly to send the feedback email with proper threading
          const mockReq = {
            params: {
              emailId: recentMessage.microsoft_message_id || recentMessage.id
            },
            query: {
              desk_id: ticket.desk_id
            },
            body: {}
          };

          const mockRes = {
            status: (code) => ({
              json: (data) => {
                console.log(`Feedback email response [${code}]:`, data);
              }
            })
          };

          // Call the resolveTicket method from emailController
          await emailController.resolveTicket(mockReq, mockRes,ticket.status);
          console.log('Feedback email sent using resolveTicket controller');
        } else {
          console.log('No recent messages found to send a threaded feedback email for ticket', ticket.id);
          // Fallback logic to send a separate email has been removed to prevent duplicates.
        }
      } catch (emailError) {
        // Log error but don't fail the request
        console.error('Error sending feedback email:', emailError);
      }
    }
    
    res.status(200).json({
      message: 'Ticket updated successfully',
      ticket: updatedTicket
    });
  } catch (error) {
    console.error('Error in updateTicket:', error);
    res.status(500).json({ 
      message: 'Error updating ticket',
      error: error.message 
    });
  }
};

// Reply to a ticket
exports.replyToTicket = async (req, res) => {
  try {
    // Check if ticket exists
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Create message
    const newMessage = await Message.create({
      ticket_id: req.params.id,
      sender_id: req.userId,
      content: req.body.content,
      is_internal: req.body.is_internal || false
    });
    
    // If not internal message, send email to customer
    if (!req.body.is_internal && ticket.customer_email) {
      try {
        // Get desk email settings
        const desk = await Desk.findById(ticket.desk_id);
        
        // Send email via appropriate email service
        const emailService = new EmailService(desk);
        await emailService.sendEmail({
          to: ticket.customer_email,
          subject: `Re: ${ticket.subject} [Ticket #${ticket.id}]`,
          body: req.body.content,
          ticketId: ticket.id,
          messageId: newMessage.id
        });
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Continue with the response even if email fails
      }
    }
    
    // Update ticket status if provided
    if (req.body.update_status) {
      await Ticket.update(req.params.id, {
        status: req.body.update_status
      });
    }
    
    res.status(201).json({
      message: 'Reply added successfully',
      ticketMessage: newMessage
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error replying to ticket',
      error: error.message 
    });
  }
};

// Delete ticket
exports.deleteTicket = async (req, res) => {
  try {
    // Check if ticket exists
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Delete ticket
    await Ticket.delete(req.params.id);
    
    res.status(200).json({
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error deleting ticket',
      error: error.message 
    });
  }
};

// Request sending a feedback email for a ticket
exports.requestTicketFeedback = async (req, res) => {
  const { ticketId } = req.params;
  // Use the API_URL or BACKEND_URL if available, otherwise NODE_ENV to determine URL
  let baseUrl = process.env.API_URL || process.env.BACKEND_URL || process.env.APP_BASE_URL;
  
  // If no environment variables are set, use appropriate default based on environment
  if (!baseUrl) {
    baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.channelplay.in'  // Production URL
      : 'http://localhost:3001';              // Development URL
  }
  
  const baseFeedbackUrl = baseUrl + '/api/tickets/feedback/submit';

  try {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (!ticket.desk_id) {
        console.error(`Cannot send feedback email: Ticket ${ticketId} has no desk_id.`);
        return res.status(400).json({ message: 'Ticket is not associated with a desk, cannot determine email settings.' });
    }
    
    const desk = await Desk.findById(ticket.desk_id);
    if (!desk) {
        console.error(`Cannot send feedback email: Desk ${ticket.desk_id} not found for ticket ${ticketId}.`);
        return res.status(404).json({ message: `Desk configuration not found for ticket's desk.` });
    }

    const feedbackToken = ticket.feedback_token || uuidv4();
    const ticketIdForLink = ticket.id; // Use the UUID for the link
    const ticketDisplayIdForText = ticket.user_ticket_id ? String(ticket.user_ticket_id) : ticket.id;

    await Ticket.update(ticketId, {
      feedback_token: feedbackToken,
      feedback_requested_at: new Date(),
      feedback_submitted_at: null,
      feedback_rating: null,
      feedback_comment: null
    });

    const customerEmail = ticket.from_address;
    const customerName = ticket.from_name || 'Valued Customer';

    if (!customerEmail) {
      console.error(`Cannot send feedback email for ticket ${ticketId}: No customer email (from_address) found.`);
      return res.status(400).json({ message: 'Customer email not found for this ticket.' });
    }

    const emailHtmlContent = generateFeedbackEmailHTML(customerName, feedbackToken, ticketDisplayIdForText, ticketIdForLink, baseFeedbackUrl);
    const emailSubject = `Tell us about your recent support experience (Ticket #${ticketDisplayIdForText})`;

    const emailServiceInstance = new EmailService(desk);
    await emailServiceInstance.init();

    await emailServiceInstance.sendEmail({
      to: customerEmail,
      subject: emailSubject,
      body: emailHtmlContent,
      ticketId: ticketId
    });

    console.log(`Feedback email requested successfully for ticket ${ticketId} to ${customerEmail}. Token: ${feedbackToken}`);
    res.status(200).json({ message: 'Feedback email request processed successfully.' });

  } catch (error) {
    console.error(`Error in requestTicketFeedback for ticket ${ticketId}:`, error);
    res.status(500).json({ message: 'Error processing feedback email request.', error: error.message });
  }
};

// Submit feedback (handles clicks from email links)
exports.submitFeedback = async (req, res) => {
  const { token, rating, ticket_id: ticketIdFromLink } = req.query;

  if (!token || !rating || !ticketIdFromLink) {
    return res.status(400).send('Missing feedback parameters (token, rating, or ticket_id).');
  }

  const parsedRating = parseInt(rating, 10);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 10) {
    return res.status(400).send('Invalid rating value. Must be a number between 1 and 10.');
  }

  try {
    const { data: tickets, error: findError } = await supabase
      .from('tickets')
      .select('*')
      .eq('feedback_token', token)
      .eq('id', ticketIdFromLink) // Assuming ticket_id in link is the main UUID ticket.id
      .limit(1);

    if (findError) {
      console.error('Error finding ticket by feedback token:', findError);
      return res.status(500).send('Error processing your feedback. Please try again later.');
    }

    const ticket = tickets && tickets.length > 0 ? tickets[0] : null;

    if (!ticket) {
      console.warn(`Feedback submission attempt with invalid token or ticket_id. Token: ${token}, TicketID from link: ${ticketIdFromLink}`);
      return res.status(404).send('Feedback link is invalid or has expired. Please contact support if you believe this is an error.');
    }

    if (ticket.feedback_submitted_at) {
      const displayId = ticket.user_ticket_id ? String(ticket.user_ticket_id) : ticket.id;
      console.log(`Feedback already submitted for ticket ${ticket.id} at ${ticket.feedback_submitted_at}.`);
      return res.send(
        `<html><body>
          <h1>Thank You!</h1>
          <p>Feedback for ticket #${displayId} has already been submitted on ${new Date(ticket.feedback_submitted_at).toLocaleString()}.</p>
          <p>If you need further assistance, please contact support.</p>
        </body></html>`
      );
    }
    
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        feedback_rating: parsedRating,
        feedback_submitted_at: new Date(),
      })
      .eq('id', ticket.id);

    if (updateError) {
      console.error('Error updating ticket with feedback:', updateError);
      return res.status(500).send('Error saving your feedback. Please try again later.');
    }
    const displayId = ticket.user_ticket_id ? String(ticket.user_ticket_id) : ticket.id;
    console.log(`Feedback submitted successfully for ticket ${ticket.id}: Rating ${parsedRating}`);
    
    // Determine color and emoji based on rating
    let color = '#3498db'; // Default blue
    let emoji = '🙂';
    let gradientColors = 'linear-gradient(135deg, #3498db, #9b59b6)';
    
    if (parsedRating >= 9) {
      color = '#1e8449'; // Dark green
      emoji = '😍';
      gradientColors = 'linear-gradient(135deg, #2ecc71, #27ae60)';
    } else if (parsedRating >= 7) {
      color = '#2ecc71'; // Green
      emoji = '😊';
      gradientColors = 'linear-gradient(135deg, #2ecc71, #3498db)';
    } else if (parsedRating >= 5) {
      color = '#3498db'; // Blue
      emoji = '🙂';
      gradientColors = 'linear-gradient(135deg, #3498db, #9b59b6)';
    } else if (parsedRating >= 3) {
      color = '#e67e22'; // Orange
      emoji = '😕';
      gradientColors = 'linear-gradient(135deg, #e67e22, #f39c12)';
    } else {
      color = '#e74c3c'; // Red
      emoji = '😞';
      gradientColors = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    }

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Thank You For Your Feedback</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
          margin: 0;
          padding: 0;
          background: ${gradientColors || '#f5f5f7'};
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          transition: background 0.5s ease;
        }
        .card-container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          padding: 20px;
          box-sizing: border-box;
        }
        .container {
          background-color: white;
          border-radius: 18px;
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.15);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          margin: 0 auto;
          position: relative;
          overflow: hidden;
        }
        .container:before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: ${color};
        }
        h1 {
          color: #333;
          font-size: 32px;
          margin-bottom: 15px;
          font-weight: 700;
        }
        .rating-container {
          padding: 20px 0;
        }
        .emoji {
          font-size: 68px;
          margin: 10px 0;
          display: block;
          line-height: 1;
        }
        .rating-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: ${gradientColors || color};
          margin: 10px auto;
          color: white;
          font-size: 42px;
          font-weight: bold;
          box-shadow: 0 6px 15px rgba(0, 0, 0, 0.15);
        }
        .rating-text {
          font-size: 24px;
          font-weight: 600;
          margin: 15px 0;
          color: ${color};
        }
        .message {
          background-color: #f9f9f9;
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
        }
        p {
          color: #555;
          line-height: 1.6;
          font-size: 16px;
          margin: 8px 0;
        }
        .close-btn {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 24px;
          background-color: ${color};
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: transform 0.2s, background-color 0.2s;
          text-decoration: none;
          font-size: 16px;
        }
        .close-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }
      </style>
    </head>
    <body>
      <div class="card-container">
        <div class="container">
          <h1>Thank You For Your Feedback!</h1>
          
          <div class="rating-container">
            <span class="emoji">${emoji}</span>
            <div class="rating-badge">${parsedRating}</div>
            <div class="rating-text">${parsedRating >= 8 ? 'Excellent!' : parsedRating >= 5 ? 'Thank You' : 'We\'ll Improve'}</div>
          </div>
          
          <div class="message">
            <p>Your rating of <strong>${parsedRating}</strong> for ticket #${displayId} has been recorded.</p>
            <p>We appreciate you taking the time to help us improve our service.</p>
          </div>
          
          <a href="#" class="close-btn" onclick="window.close(); return false;">Close Window</a>
        </div>
      </div>
    </body>
    </html>
    `);

  } catch (error) {
    console.error('Error in submitFeedback:', error);
    res.status(500).send('An unexpected error occurred. Please try again later.');
  }
};

// Get ticket metrics
exports.getTicketMetrics = async (req, res) => {
  try {
    // Import supabase from db.config.js
    const { supabase } = require('../config/db.config');
    
    // Use Supabase to get ticket counts by status
    const { data, error } = await supabase
      .from('tickets')
      .select('status')
      .order('status');
      
    if (error) {
      throw new Error(`Error getting ticket metrics: ${error.message}`);
    }
    
    // Count tickets by status
    const statusCounts = {};
    data.forEach(ticket => {
      statusCounts[ticket.status] = (statusCounts[ticket.status] || 0) + 1;
    });
    
    res.status(200).json({
      metrics: {
        statusCounts,
        // Add more metrics here as needed
      }
    });
  } catch (error) {
    console.error('Error in getTicketMetrics:', error);
    res.status(500).json({ 
      message: 'Error getting ticket metrics',
      error: error.message 
    });
  }
};

// Create a ticket from an email
exports.createTicketFromEmail = async (req, res) => {
  try {
    // Import necessary modules
    const { supabase } = require('../config/db.config');
    const axios = require('axios');
    
    const { email_id, desk_id } = req.body;
    
    if (!email_id || !desk_id) {
      return res.status(400).json({ message: 'Email ID and Desk ID are required' });
    }
    
    // Get the email integration for the desk to access Microsoft Graph API
    const { data: integration, error: integrationError } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', desk_id)
      .single();
      
    if (integrationError || !integration) {
      return res.status(404).json({ message: 'Email integration not found for this desk' });
    }
    
    if (!integration.access_token) {
      return res.status(400).json({ message: 'No access token available for this desk' });
    }
    
    // Fetch the email content from Microsoft Graph API
    const emailResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${email_id}?$select=id,subject,bodyPreview,body,from,receivedDateTime`,
      {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const email = emailResponse.data;
    
    // Create a new ticket in Supabase
    const { data: newTicket, error: ticketError } = await supabase
      .from('tickets')
      .insert([
        {
          subject: email.subject || 'No Subject',
          description: email.bodyPreview || 'No content',
          status: 'new',
          priority: 'medium',
          desk_id: desk_id,
          customer_email: email.from?.emailAddress?.address || 'unknown@example.com',
          customer_name: email.from?.emailAddress?.name || 'Unknown Sender',
          source: 'email',
          source_id: email_id
        }
      ])
      .select()
      .single();
      
    if (ticketError) {
      throw new Error(`Error creating ticket: ${ticketError.message}`);
    }
    
    // Create the initial message with the email content
    const { error: messageError } = await supabase
      .from('messages')
      .insert([
        {
          ticket_id: newTicket.id,
          sender_email: email.from?.emailAddress?.address || 'unknown@example.com',
          sender_name: email.from?.emailAddress?.name || 'Unknown Sender',
          content: email.body?.content || email.bodyPreview || 'No content',
          content_type: email.body?.contentType || 'text',
          is_internal: false,
          message_type: 'ticket',
          source: 'email',
          source_id: email_id
        }
      ]);
      
    if (messageError) {
      console.error('Error creating message:', messageError);
      // Continue anyway, as the ticket was created successfully
    }
    
    // Mark the email as read in Microsoft Graph API
    try {
      await axios.patch(
        `https://graph.microsoft.com/v1.0/me/messages/${email_id}`,
        { isRead: true },
        {
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (markReadError) {
      console.error('Error marking email as read:', markReadError);
      // Continue anyway, as the ticket was created successfully
    }
    
    return res.status(201).json({
      message: 'Ticket created successfully from email',
      data: newTicket
    });
  } catch (error) {
    console.error('Error in createTicketFromEmail:', error);
    return res.status(500).json({ 
      message: 'Error creating ticket from email',
      error: error.message 
    });
  }
};
