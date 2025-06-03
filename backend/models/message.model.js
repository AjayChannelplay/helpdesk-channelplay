const { supabase } = require('../config/db.config');

const Message = {
  /**
   * Logs an email message (incoming or outgoing) to the database.
   * This method is intended to be the primary way to save email messages.
   * It will also associate the message with a ticket if a ticket_id is provided.
   */
  logMessage: async (messageData) => {
    const {
      desk_id, // Required: links message to a helpdesk
      ticket_id, // Optional: links message to a specific ticket
      microsoft_message_id, // Required for incoming, optional for outgoing if not immediately available
      microsoft_conversation_id,
      subject,
      body_preview,
      body_html,
      body_text,
      from_address,
      from_name,
      to_recipients, // Array of { email, name }
      cc_recipients, // Array of { email, name }
      bcc_recipients, // Array of { email, name }
      received_at, // Timestamp for incoming
      sent_at, // Timestamp for outgoing
      is_read_on_server, // From MS Graph
      has_attachments,
      importance,
      direction, // 'incoming' or 'outgoing'
      in_reply_to_microsoft_id, // Microsoft ID of the message this is a reply to
      sender_id, // User ID if sent by an agent internally
      is_internal = false, // For agent notes vs actual emails
      // Deprecating 'content' in favor of body_html/body_text
      // Deprecating 'email_message_id' in favor of 'microsoft_message_id'
    } = messageData;

    const messageToInsert = {
      desk_id,
      ticket_id,
      microsoft_message_id,
      microsoft_conversation_id,
      subject,
      body_preview,
      body_html,
      body_text,
      from_address,
      from_name,
      to_recipients: to_recipients || [],
      cc_recipients: cc_recipients || [],
      bcc_recipients: bcc_recipients || [],
      received_at,
      sent_at,
      is_read_on_server: is_read_on_server || false,
      has_attachments: has_attachments || false,
      importance,
      direction,
      in_reply_to_microsoft_id,
      sender_id: messageData.sender_id || null, // Internal user ID (agent), defaults to null
      is_internal,
      // Ensure created_at and updated_at are handled by Supabase defaults or triggers
    };

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert])
        .select();

      if (error) {
        console.error('Supabase insert error in logMessage:', error);
        throw new Error(`Error logging message: ${error.message}`);
      }
      return data ? data[0] : null;
    } catch (error) {
      console.error('Catch block error in logMessage:', error);
      throw error; // Re-throw to be caught by caller
    }
  },

  /**
   * Finds a message by its Microsoft Graph API ID.
   */
  findByMicrosoftId: async (microsoftMessageId) => {
    if (!microsoftMessageId) {
      throw new Error('Microsoft Message ID is required.');
    }
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('microsoft_message_id', microsoftMessageId)
        .maybeSingle(); // Returns one record or null, not an array

      if (error) {
        throw new Error(`Error finding message by Microsoft ID: ${error.message}`);
      }
      return data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Finds an existing message by Microsoft ID or creates a new one.
   * Useful for polling services to avoid duplicate entries and update existing ones.
   */
  findOrCreateByMicrosoftId: async (messageData) => {
    const existingMessage = await Message.findByMicrosoftId(messageData.microsoft_message_id);

    if (existingMessage) {
      // Message exists, potentially update it (e.g., read status, new attachments flag)
      const updatePayload = {
        is_read_on_server: messageData.is_read_on_server !== undefined ? messageData.is_read_on_server : existingMessage.is_read_on_server,
        has_attachments: messageData.has_attachments !== undefined ? messageData.has_attachments : existingMessage.has_attachments,
        // Add other fields to update if necessary, e.g., body if it can change
        body_preview: messageData.body_preview || existingMessage.body_preview,
        body_html: messageData.body_html || existingMessage.body_html,
        body_text: messageData.body_text || existingMessage.body_text,
        // Ensure updated_at is handled by Supabase
      };

      try {
        const { data, error } = await supabase
          .from('messages')
          .update(updatePayload)
          .eq('id', existingMessage.id)
          .select();
        
        if (error) {
          throw new Error(`Error updating message by Microsoft ID ${existingMessage.microsoft_message_id}: ${error.message}`);
        }
        return data ? data[0] : null;
      } catch (error) {
        throw error;
      }
    } else {
      // Message doesn't exist, create it using logMessage
      return Message.logMessage(messageData);
    }
  },
  
  // Find message by internal DB id
  findById: async (id) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:sender_id(id, username)') // Example of joining with users table if sender_id is a FK to users
        .eq('id', id)
        .single(); // Returns one record or throws error if not found/multiple

      if (error && error.code !== 'PGRST116') { // PGRST116: Row not found, which is acceptable for a 'find'
        throw new Error(`Error finding message by ID: ${error.message}`);
      }
      return data;
    } catch (error) {
      throw error;
    }
  },
  
  // Find messages by ticket id, ordered by creation time
  findByTicketId: async (ticketId) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:sender_id(id, username)') // Adjust join as per your users table setup
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Error finding messages by ticket ID: ${error.message}`);
      }
      return data || [];
    } catch (error) {
      throw error;
    }
  },
  
  // Update message by internal DB ID (for internal properties like is_internal, or associating with ticket)
  update: async (id, updateData) => {
    // Only allow updating specific, safe fields. Content of synced emails shouldn't be changed here.
    const allowedUpdates = {};
    if (updateData.ticket_id !== undefined) allowedUpdates.ticket_id = updateData.ticket_id;
    if (updateData.is_internal !== undefined) allowedUpdates.is_internal = updateData.is_internal;
    // Add other fields that are safe to update internally

    if (Object.keys(allowedUpdates).length === 0) {
      throw new Error('No valid fields provided for update.');
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .update(allowedUpdates)
        .eq('id', id)
        .select();
      
      if (error) {
        throw new Error(`Error updating message ${id}: ${error.message}`);
      }
      return data ? data[0] : null;
    } catch (error) {
      throw error;
    }
  },
  
  // Delete message by internal DB ID (use with caution, typically messages shouldn't be hard deleted)
  delete: async (id) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', id)
        .select(); // Returns the deleted record(s)

      if (error) {
        throw new Error(`Error deleting message ${id}: ${error.message}`);
      }
      return data ? data[0] : null;
    } catch (error) {
      throw error;
    }
  }
};

module.exports = Message;
