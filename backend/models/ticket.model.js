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
          creator:created_by (username),
          assignee:assigned_to (username),
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
      // For example, to match 'creator_name', 'assignee_name', 'desk_name':
      if (data) {
        return {
          ...data,
          creator_name: data.creator?.username,
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
    const { subject, description, priority, status, desk_id, assigned_to } = ticketData;
    
    const query = `
      UPDATE tickets
      SET subject = $1, 
          description = $2, 
          priority = $3, 
          status = $4, 
          desk_id = $5, 
          assigned_to = $6,
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [
        subject, 
        description, 
        priority, 
        status, 
        desk_id, 
        assigned_to, 
        id
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating ticket: ${error.message}`);
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
