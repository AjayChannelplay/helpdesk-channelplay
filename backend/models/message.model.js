const db = require('../config/db.config');

const Message = {
  // Create a new message
  create: async (messageData) => {
    const { 
      ticket_id, 
      sender_id, 
      content, 
      is_internal, 
      email_message_id, 
      has_attachments 
    } = messageData;
    
    const query = `
      INSERT INTO messages (
        ticket_id, 
        sender_id, 
        content, 
        is_internal, 
        email_message_id, 
        has_attachments
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [
        ticket_id, 
        sender_id, 
        content, 
        is_internal || false, 
        email_message_id, 
        has_attachments || false
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating message: ${error.message}`);
    }
  },
  
  // Find message by id
  findById: async (id) => {
    const query = `
      SELECT m.*, u.username as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.id = $1
    `;
    
    try {
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding message: ${error.message}`);
    }
  },
  
  // Find messages by ticket id
  findByTicketId: async (ticketId) => {
    const query = `
      SELECT m.*, u.username as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.ticket_id = $1
      ORDER BY m.created_at ASC
    `;
    
    try {
      const result = await db.query(query, [ticketId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding messages: ${error.message}`);
    }
  },
  
  // Find message by email message id
  findByEmailMessageId: async (emailMessageId) => {
    const query = 'SELECT * FROM messages WHERE email_message_id = $1';
    
    try {
      const result = await db.query(query, [emailMessageId]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding message by email id: ${error.message}`);
    }
  },
  
  // Update message
  update: async (id, messageData) => {
    const { content, is_internal, has_attachments } = messageData;
    
    const query = `
      UPDATE messages
      SET content = $1, 
          is_internal = $2, 
          has_attachments = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [content, is_internal, has_attachments, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating message: ${error.message}`);
    }
  },
  
  // Delete message
  delete: async (id) => {
    const query = 'DELETE FROM messages WHERE id = $1 RETURNING *';
    try {
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting message: ${error.message}`);
    }
  }
};

module.exports = Message;
