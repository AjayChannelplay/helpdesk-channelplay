const Feedback = require('../models/feedback.model');
const Ticket = require('../models/ticket.model');
const { supabase } = require('../config/db.config');

/**
 * Generate the feedback collection form HTML
 */
function generateFeedbackForm(ticketId, messageId) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>How satisfied are you with our service?</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        text-align: center;
        margin: 0;
        padding: 20px;
        background-color: #f5f5f5;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      .container {
        background-color: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        padding: 40px 30px;
        max-width: 600px;
        width: 100%;
        margin: 0 auto;
      }
      h1 {
        color: #333;
        font-size: 28px;
        margin-bottom: 10px;
        font-weight: 600;
      }
      p {
        color: #666;
        font-size: 16px;
        margin-bottom: 30px;
      }
      .rating-buttons {
        display: flex;
        justify-content: center;
        gap: 15px;
        flex-wrap: wrap;
        margin-bottom: 20px;
        max-width: 600px;
        margin-left: auto;
        margin-right: auto;
      }
      .rating-btn {
        width: 55px;
        height: 55px;
        border-radius: 50%;
        border: 2px solid #e0e0e0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: 600;
        cursor: pointer;
        color: white;
        transition: all 0.25s ease;
        text-decoration: none;
        box-shadow: 0 3px 8px rgba(0,0,0,0.12);
        position: relative;
      }
      .number {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        line-height: 1;
      }
      .double-digit {
        font-size: 95%;
        margin-left: -1px;
      }
      .rating-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 5px 15px rgba(0,0,0,0.18);
      }
      .rating-btn:nth-child(1) { background-color: #ff5a65; border-color: #ff5a65; }
      .rating-btn:nth-child(2) { background-color: #ff7a7e; border-color: #ff7a7e; }
      .rating-btn:nth-child(3) { background-color: #ff9a7e; border-color: #ff9a7e; }
      .rating-btn:nth-child(4) { background-color: #ffba7e; border-color: #ffba7e; }
      .rating-btn:nth-child(5) { background-color: #f3b941; border-color: #f3b941; }
      .rating-btn:nth-child(6) { background-color: #e0c54d; border-color: #e0c54d; }
      .rating-btn:nth-child(7) { background-color: #c8cf58; border-color: #c8cf58; }
      .rating-btn:nth-child(8) { background-color: #a3d063; border-color: #a3d063; }
      .rating-btn:nth-child(9) { background-color: #76ca6d; border-color: #76ca6d; }
      .rating-btn:nth-child(10) { background-color: #26cb7c; border-color: #26cb7c; }
      .rating-btn.active {
        transform: scale(1.15);
        box-shadow: 0 5px 18px rgba(0,0,0,0.25);
      }
      .rating-labels {
        display: flex;
        justify-content: space-between;
        width: 95%;
        max-width: 550px;
        margin: 12px auto 30px;
        color: #666;
        font-size: 14px;
      }
      .comment-container {
        margin-top: 30px;
        display: none;
      }
      textarea {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin-bottom: 20px;
        font-family: inherit;
        resize: vertical;
      }
      .submit-btn {
        background-color: #3d82eb;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 25px;
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .submit-btn:hover {
        background-color: #2a6dd1;
      }
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>How satisfied are you with our service?</h1>
      <p>Click on a number to rate your satisfaction level</p>
      
      <div class="rating-buttons">
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=1" class="rating-btn"><span class="number">1</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=2" class="rating-btn"><span class="number">2</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=3" class="rating-btn"><span class="number">3</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=4" class="rating-btn"><span class="number">4</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=5" class="rating-btn"><span class="number">5</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=6" class="rating-btn"><span class="number">6</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=7" class="rating-btn"><span class="number">7</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=8" class="rating-btn"><span class="number">8</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=9" class="rating-btn"><span class="number">9</span></a>
        <a href="/api/feedback/process?ticketId=${ticketId}&messageId=${messageId}&rating=10" class="rating-btn"><span class="number double-digit">10</span></a>
      </div>
      
      <div class="rating-labels">
        <span>Very Dissatisfied</span>
        <span>Very Satisfied</span>
      </div>
      
      <!-- Optional: Add comment form if needed -->
      <!-- 
      <div class="comment-container" id="commentSection">
        <form action="/api/feedback/process" method="get">
          <input type="hidden" name="ticketId" value="${ticketId}">
          <input type="hidden" name="messageId" value="${messageId}">
          <input type="hidden" name="rating" id="ratingInput">
          <textarea name="comments" rows="4" placeholder="Tell us more about your experience (optional)"></textarea>
          <button type="submit" class="submit-btn">Submit Feedback</button>
        </form>
      </div>
      -->
    </div>
    
    <script>
      // Uncomment if you want to add the comment section functionality
      /*
      const ratingButtons = document.querySelectorAll('.rating-btn');
      const commentSection = document.getElementById('commentSection');
      const ratingInput = document.getElementById('ratingInput');
      
      ratingButtons.forEach(button => {
        button.addEventListener('click', function(e) {
          e.preventDefault();
          
          // Clear any previously selected buttons
          ratingButtons.forEach(btn => btn.classList.remove('active'));
          
          // Mark this button as active
          this.classList.add('active');
          
          // Get the rating value
          const rating = this.textContent;
          ratingInput.value = rating;
          
          // Show comment section
          commentSection.style.display = 'block';
        });
      });
      */
    </script>
  </body>
  </html>
  `;
}

/**
 * Generate thank you page HTML
 * @param {string} rating - The rating value
 * @param {string} ticketId - The ticket ID
 * @param {string} token - The feedback token
 */
function generateThankYouPage(rating, ticketId, token, ticketNumber) {
  const numericRating = parseInt(rating, 10);
  let color = '#3498db'; // Default blue
  let emoji = '😐';
  let gradientColors = '';
  
  if (numericRating >= 9) {
    color = '#1e8449'; // Dark green
    emoji = '😍';
    gradientColors = 'linear-gradient(135deg, #2ecc71, #27ae60)';
  } else if (numericRating >= 7) {
    color = '#2ecc71'; // Green
    emoji = '😊';
    gradientColors = 'linear-gradient(135deg, #2ecc71, #3498db)';
  } else if (numericRating >= 5) {
    color = '#3498db'; // Blue
    emoji = '🙂';
    gradientColors = 'linear-gradient(135deg, #3498db, #9b59b6)';
  } else if (numericRating >= 3) {
    color = '#e67e22'; // Orange
    emoji = '😕';
    gradientColors = 'linear-gradient(135deg, #e67e22, #f39c12)';
  } else {
    color = '#e74c3c'; // Red
    emoji = '😞';
    gradientColors = 'linear-gradient(135deg, #e74c3c, #c0392b)';
  }
  
  return `
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
      .ticket-reference {
        font-size: 14px;
        color: #888;
        margin-top: 20px;
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
      @media screen and (max-width: 600px) {
        .container {
          padding: 30px 20px;
        }
        h1 {
          font-size: 28px;
        }
      }
    </style>
  </head>
  <body>
    <div class="card-container">
      <div class="container">
        <h1>Thank You For Your Feedback!</h1>
        
        <div class="rating-container">
          <span class="emoji">${emoji}</span>
          <div class="rating-badge">${rating}</div>
          <div class="rating-text">${numericRating >= 8 ? 'Excellent!' : numericRating >= 5 ? 'Thank You' : 'We\'ll Improve'}</div>
        </div>
        
        <div class="message">
          <p>Your rating of <strong>${rating}</strong> for ticket <strong>#${ticketNumber|| '---'}</strong> has been recorded.</p>
          <p>We appreciate you taking the time to help us improve our service.</p>
        </div>
        
        <a href="#" class="close-btn" onclick="window.close(); return false;">Close Window</a>
        
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * Display the feedback form
 */
exports.showFeedbackForm = async (req, res) => {
  try {
    const { ticketId, messageId } = req.query;
    
    if (!ticketId) {
      return res.status(400).send({ 
        message: 'Missing required parameter: ticketId.'
      });
    }
    
    // Return the feedback form HTML
    return res.send(generateFeedbackForm(ticketId, messageId));
  } catch (error) {
    console.error('Error displaying feedback form:', error);
    return res.status(500).send({ 
      message: 'An error occurred while generating the feedback form.' 
    });
  }
};

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
    
    // Validate rating value is a number between 1-10
    const numericRating = parseInt(rating, 10);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 10) {
      return res.status(400).send({ 
        message: 'Invalid rating value. Must be a number between 1 and 10.' 
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
      agent_id: agentId,// Link feedback to the agent we found
      ticket_number:ticket?.user_ticket_id

    };
  
    console.log(`Agent ID found for this feedback: ${agentId}`);
  
    // Log for debugging
    console.log('Creating feedback with data:', {
      ticket_id: feedbackData.ticket_id,
      conversation_id: feedbackData.conversation_id,
      rating: feedbackData.rating,
      customer_email: feedbackData.customer_email,
      message_id: feedbackData.message_id,
      ticket_number: feedbackData.ticket_number
    });
    
    try {
      const feedback = await Feedback.create(feedbackData);
      console.log('Feedback recorded successfully:', feedback);
    } catch (error) {
      console.error('Error recording feedback:', error);
      // Even if we failed to record in the database, show the thank you page
      // so the user has a better experience
    }
    
    // Return a thank you page with improved UI
    return res.send(generateThankYouPage(numericRating, ticketId, req.query.token,feedbackData.ticket_number));
  
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
