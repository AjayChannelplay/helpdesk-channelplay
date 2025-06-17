const { supabase } = require('../config/db.config'); // Ensure supabase is exported from db.config

const Ticket = {
  // Create a new ticket
  create: async (ticketData) => {
    const { subject, description, priority, status, desk_id, created_by, assigned_to, customer_email } = ticketData;
    
    const query = `
      INSERT INTO tickets 
      (subject, description, priority, status, desk_id, created_by, assigned_to, customer_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [
        subject, 
        description, 
        priority || 'medium', 
        status || 'new', 
        desk_id, 
        created_by, 
        assigned_to, 
        customer_email
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating ticket: ${error.message}`);
    }
  },
  
  // Find ticket by id
  findById: async (id) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          assignee:assigned_to_user_id (username),
          desk:desk_id (name)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Row not found, not necessarily an error for a 'find' operation
          return null;
        }
        console.error('Supabase select error in Ticket.findById:', error);
        throw new Error(`Error finding ticket: ${error.message}`);
      }
      
      // Transform the data to match the previous structure if needed, or adjust consuming code.
      if (data) {
        return {
          ...data,
          // No creator_name since created_by doesn't exist in schema
          assignee_name: data.assignee?.username,
          desk_name: data.desk?.name,
        };
      }
      return null;

    } catch (error) {
      console.error('Exception in Ticket.findById:', error);
      throw new Error(`Error finding ticket: ${error.message}`);
    }
  },
  
  // Find all tickets
  findAll: async (filters = {}) => {
    let query = `
      SELECT t.*, u1.username as creator_name, u2.username as assignee_name, d.name as desk_name
      FROM tickets t
      LEFT JOIN users u1 ON t.created_by = u1.id
      LEFT JOIN users u2 ON t.assigned_to = u2.id
      LEFT JOIN desks d ON t.desk_id = d.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    if (filters.status) {
      queryParams.push(filters.status);
      query += ` AND t.status = $${queryParams.length}`;
    }
    
    if (filters.desk_id) {
      queryParams.push(filters.desk_id);
      query += ` AND t.desk_id = $${queryParams.length}`;
    }
    
    if (filters.assigned_to) {
      queryParams.push(filters.assigned_to);
      query += ` AND t.assigned_to = $${queryParams.length}`;
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    try {
      const result = await db.query(query, queryParams);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding tickets: ${error.message}`);
    }
  },
  
  // Update ticket
  update: async (id, ticketData) => {
    try {
      // First, fetch the existing ticket to ensure we have conversation_id
      const { data: existingTicket, error: fetchError } = await supabase
        .from('tickets')
        .select('conversation_id') // Only select what we need
        .eq('id', id)
        .single();

      if (fetchError || !existingTicket) {
        console.error('Error fetching existing ticket for update or ticket not found:', fetchError);
        throw new Error(fetchError?.message || 'Ticket not found for update.');
      }

      const updateData = {};
      if (ticketData.subject !== undefined) updateData.subject = ticketData.subject;
      if (ticketData.description !== undefined) updateData.description = ticketData.description;
      if (ticketData.priority !== undefined) updateData.priority = ticketData.priority;
      if (ticketData.status !== undefined) updateData.status = ticketData.status;
      if (ticketData.desk_id !== undefined) updateData.desk_id = ticketData.desk_id;
      if (ticketData.assigned_to_user_id !== undefined) updateData.assigned_to_user_id = ticketData.assigned_to_user_id;
      if (ticketData.assigned_to !== undefined) updateData.assigned_to_user_id = ticketData.assigned_to; // For backward compatibility
      
      // Ensure conversation_id is preserved
      if (existingTicket.conversation_id) {
        updateData.conversation_id = existingTicket.conversation_id;
      } else {
        // This case should ideally not happen if conversation_id is NOT NULL and ticket exists
        console.error(`CRITICAL: conversation_id is NULL for existing ticket id ${id}. This should not happen, but proceeding with update.`);
        // If the DB constraint is active, the .update() below will fail if existingTicket.conversation_id was null and it's required.
      }
      
      updateData.updated_at = new Date();
      
      const { data, error: updateError } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (updateError) {
        console.error('Error updating ticket in Supabase:', updateError);
        throw new Error(`Error updating ticket: ${updateError.message}`);
      }
      
      return data;
    } catch (error) {
      // Log the full error if it's not already one of our specific messages
      if (!error.message.startsWith('Error updating ticket') && !error.message.startsWith('Ticket not found')) {
        console.error('Exception in Ticket.update:', error);
      }
      throw error; // Re-throw to be caught by controller
    }
  },
  
  // Delete ticket
  delete: async (id) => {
    const query = 'DELETE FROM tickets WHERE id = $1 RETURNING *';
    try {
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting ticket: ${error.message}`);
    }
  },
  
  // Get ticket metrics (count by status)
  getMetricsByStatus: async () => {
    const query = `
      SELECT status, COUNT(*) as count
      FROM tickets
      GROUP BY status
    `;
    
    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting ticket metrics: ${error.message}`);
    }
  }
};

module.exports = Ticket;
