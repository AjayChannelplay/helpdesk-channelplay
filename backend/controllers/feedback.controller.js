const Feedback = require('../models/feedback.model');
const Ticket = require('../models/ticket.model');
const { supabase } = require('../config/db.config');

/**
 * Process customer feedback from email links
 */
exports.processFeedback = async (req, res) => {
  try {
    const { ticketId, messageId, rating, comments } = req.query;
    
    if (!ticketId || !rating) {
      return res.status(400).send({ 
        message: 'Missing required parameters. Please provide ticketId and rating.' 
      });
    }
    
    // Validate rating value
    if (!['positive', 'neutral', 'negative'].includes(rating)) {
      return res.status(400).send({ 
        message: 'Invalid rating value. Must be one of: positive, neutral, negative.' 
      });
    }
    
    // Check if this is a Microsoft conversation ID (it will be in a different format than UUID)
    let ticket;
    let actualTicketId;
    let customerEmail;
    
    // Find the message with this conversation ID
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('ticket_id, from_address, to_recipients, desk_id, assigned_to_user_id')
      .eq('microsoft_conversation_id', ticketId)
      .order('created_at', { ascending: false });
    
    if (messagesError) {
      console.error('Error finding message by conversation ID:', messagesError);
    }
    
    if (messages && messages.length > 0) {
      // We found messages with this conversation ID
      console.log(`Found ${messages.length} messages with conversation ID ${ticketId}`);
      
      // Try to get the ticket_id if available
      for (const msg of messages) {
        if (msg.ticket_id) {
          actualTicketId = msg.ticket_id;
          console.log(`Found ticket ID ${actualTicketId} for conversation ID ${ticketId}`);
          break;
        }
      }
      
      // Try to determine customer email from the messages
      for (const msg of messages) {
        if (msg.from_address && !msg.from_address.includes('channelplay.in')) {
          customerEmail = msg.from_address;
          console.log(`Using customer email from message: ${customerEmail}`);
          break;
        } else if (msg.to_recipients && msg.to_recipients.length > 0) {
          // If it's an outgoing message, the customer might be in to_recipients
          const customerRecipient = msg.to_recipients.find(r => r && typeof r.address === 'string' && !r.address.includes('channelplay.in'));
          if (customerRecipient) {
            customerEmail = customerRecipient.address;
            console.log(`Using customer email from recipient: ${customerEmail}`);
            break;
          }
        }
      }
      
      // If we found a ticket_id, get the full ticket details
      if (actualTicketId) {
        const { data: ticketData, error: ticketError } = await supabase
          .from('tickets')
          .select('*')
          .eq('id', actualTicketId)
          .single();
        
        if (ticketError) {
          console.error('Error finding ticket:', ticketError);
        } else {
          ticket = ticketData;
          if (!customerEmail && ticket.customer_email) {
            customerEmail = ticket.customer_email;
          }
        }
      }
    } else {
      // If we can't find by conversation ID, try direct ticket lookup (though unlikely to work)
      try {
        ticket = await Ticket.findById(ticketId);
        if (ticket && ticket.customer_email) {
          customerEmail = ticket.customer_email;
        }
      } catch (err) {
        console.error('Error finding ticket by ID:', err);
      }
    }
    
    // If we still couldn't find a proper ticket association, we'll still record the feedback
    // but with more generic information
    
    // Try to find the agent for this conversation
    let agentId = null;
    if (ticket?.assigned_to_user_id) {
      agentId = ticket.assigned_to_user_id;
    } else if (messages && messages.length > 0) {
      // Check if any message has assigned_to_user_id
      for (const msg of messages) {
        if (msg.assigned_to_user_id) {
          agentId = msg.assigned_to_user_id;
          break;
        }
      }
    }
  
    // Create feedback entry with whatever information we have
    const feedbackData = {
      ticket_id: actualTicketId || null, // Only use a valid database ID, not conversation ID directly
      conversation_id: ticketId, // Always store the conversation ID
      rating: rating,
      customer_email: customerEmail || (ticket?.customer_email) || 'unknown@customer.com', // Fallback to unknown
      message_id: messageId || null,
      comments: comments || null,
      agent_id: agentId // Link feedback to the agent we found
    };
  
    console.log(`Agent ID found for this feedback: ${agentId}`);
  
    // Log for debugging
    console.log('Creating feedback with data:', {
      ticket_id: feedbackData.ticket_id,
      conversation_id: feedbackData.conversation_id,
      rating: feedbackData.rating,
      customer_email: feedbackData.customer_email,
      message_id: feedbackData.message_id
    });
    
    try {
      const feedback = await Feedback.create(feedbackData);
      console.log('Feedback recorded successfully:', feedback);
    } catch (error) {
      console.error('Error recording feedback:', error);
      // Even if we failed to record in the database, show the thank you page
      // so the user has a better experience
    }
    
    // Return a thank you page
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Thank You For Your Feedback</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin-top: 50px;
            background-color: #f5f5f5;
          }
          .container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 40px;
            max-width: 500px;
            margin: 0 auto;
          }
          h1 {
            color: #4CAF50;
          }
          p {
            color: #555;
            line-height: 1.5;
          }
          .emoji {
            font-size: 48px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Thank You!</h1>
          <div class="emoji">
            ${rating === 'positive' ? '😃' : rating === 'neutral' ? '😐' : '😞'}
          </div>
          <p>We appreciate your feedback. It helps us improve our service.</p>
          <p>Your response has been recorded.</p>
          <p>You can now close this window.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error processing feedback:', error);
    return res.status(500).send({ 
      message: 'An error occurred while processing your feedback.' 
    });
  }
};

/**
 * Get feedback statistics for dashboard
 */
exports.getFeedbackStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).send({ 
        message: 'Missing required parameters. Please provide startDate and endDate.' 
      });
    }
    
    const stats = await Feedback.getStatsByDateRange(startDate, endDate);
    
    return res.status(200).send(stats);
  } catch (error) {
    console.error('Error fetching feedback statistics:', error);
    return res.status(500).send({ 
      message: 'An error occurred while fetching feedback statistics.' 
    });
  }
};

/**
 * Get feedback distribution for charts/graphs
 */
exports.getFeedbackDistribution = async (req, res) => {
  try {
    const data = await Feedback.getFeedbackDistribution();
    return res.status(200).send(data);
  } catch (error) {
    console.error('Error fetching feedback distribution:', error);
    return res.status(500).send({ 
      message: 'An error occurred while fetching feedback distribution.'
    });
  }
};

/**
 * Get all feedback for a specific ticket
 */
exports.getTicketFeedback = async (req, res) => {
  try {
    const ticketId = req.params.ticketId;
    
    if (!ticketId) {
      return res.status(400).send({ 
        message: 'Missing ticket ID parameter.'
      });
    }
    
    const feedback = await Feedback.getByTicketId(ticketId);
    return res.status(200).send(feedback);
  } catch (error) {
    console.error('Error fetching ticket feedback:', error);
    return res.status(500).send({ 
      message: 'An error occurred while fetching ticket feedback.'
    });
  }
};
