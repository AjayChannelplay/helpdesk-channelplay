const Ticket = require('../models/ticket.model');
const Message = require('../models/message.model');
const Desk = require('../models/desk.model');
const EmailService = require('../utils/email.service');

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
      query = query.eq('status', req.query.status);
    }
    
    if (req.query.deskId) {
      query = query.eq('desk_id', req.query.deskId);
    }
    
    if (req.query.assigned_to) {
      query = query.eq('assigned_to', req.query.assigned_to);
    }
    
    // Execute the query
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Error finding tickets: ${error.message}`);
    }
    
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
    
    // Update ticket
    const updatedTicket = await Ticket.update(req.params.id, {
      subject: req.body.subject || ticket.subject,
      description: req.body.description || ticket.description,
      priority: req.body.priority || ticket.priority,
      status: req.body.status || ticket.status,
      desk_id: req.body.desk_id || ticket.desk_id,
      assigned_to: req.body.assigned_to || ticket.assigned_to
    });
    
    // Create internal note about the update if requested
    if (req.body.add_internal_note) {
      await Message.create({
        ticket_id: req.params.id,
        sender_id: req.userId,
        content: `Ticket updated: ${req.body.update_note || 'Status changed to ' + req.body.status}`,
        is_internal: true
      });
    }
    
    res.status(200).json({
      message: 'Ticket updated successfully',
      ticket: updatedTicket
    });
  } catch (error) {
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
