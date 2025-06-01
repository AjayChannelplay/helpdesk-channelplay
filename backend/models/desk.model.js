const { supabase } = require('../config/db.config');

const Desk = {
  // Create a new desk
  create: async (deskData) => {
    const { name, description, email_address, provider_type, allowed_domains } = deskData;
    
    try {
      const { data, error } = await supabase
        .from('desks')
        .insert({
          name,
          description,
          email_address,
          provider_type: provider_type || 'MICROSOFT',
          allowed_domains
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error creating desk: ${error.message}`);
    }
  },
  
  // Find desk by id
  findById: async (id) => {
    try {
      const { data, error } = await supabase
        .from('desks')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error finding desk: ${error.message}`);
    }
  },
  
  // Find all desks
  findAll: async () => {
    try {
      const { data, error } = await supabase
        .from('desks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Error finding all desks: ${error.message}`);
    }
  },
  
  // Update desk
  update: async (id, deskData) => {
    try {
      // Add updated_at timestamp
      const updateData = {
        ...deskData,
        updated_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('desks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error updating desk: ${error.message}`);
    }
  },
  
  // Delete desk
  delete: async (id) => {
    try {
      const { data, error } = await supabase
        .from('desks')
        .delete()
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error deleting desk: ${error.message}`);
    }
  },
  
  // Assign agent to desk
  assignAgent: async (deskId, userId) => {
    try {
      console.log(`[desk.model] assignAgent - Assigning desk ID: ${deskId} to user ID: ${userId}`);
      
      // Ensure both IDs are strings to avoid type mismatches
      const desk_id = String(deskId);
      const user_id = String(userId);
      
      console.log(`[desk.model] assignAgent - Normalized IDs - desk_id: ${desk_id}, user_id: ${user_id}`);
      
      // First check if assignment already exists
      const { data: existingAssignment, error: checkError } = await supabase
        .from('desk_assignments')
        .select('*')
        .eq('desk_id', desk_id)
        .eq('user_id', user_id);
      
      if (checkError) {
        console.error('[desk.model] assignAgent - Error checking existing assignment:', checkError);
      } else if (existingAssignment && existingAssignment.length > 0) {
        console.log('[desk.model] assignAgent - Assignment already exists:', existingAssignment[0]);
        return existingAssignment[0]; // Return existing assignment if found
      }
      
      // Insert new assignment
      const { data, error } = await supabase
        .from('desk_assignments')
        .upsert(
          { desk_id: desk_id, user_id: user_id },
          { onConflict: 'desk_id,user_id' }
        )
        .select()
        .single();
      
      if (error) {
        console.error('[desk.model] assignAgent - Supabase error in assignAgent:', error);
        throw error;
      }
      
      console.log('[desk.model] assignAgent - Assignment successful:', data);
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[desk.model] assignAgent - Caught error:', error);
      throw new Error(`Error assigning agent to desk: ${errorMessage}`);
    }
  },
  
  // Get desks assigned to an agent
  getAgentDesks: async (userId) => {
    try {
      console.log(`[desk.model] getAgentDesks - fetching desk assignments for user ID: ${userId}`);
      
      const { data, error } = await supabase
        .from('desk_assignments')
        .select('desk_id')
        .eq('user_id', userId);
      
      if (error) {
        console.error(`[desk.model] getAgentDesks - Error fetching desk_assignments:`, error);
        throw error;
      }
      
      console.log(`[desk.model] getAgentDesks - desk_assignments data:`, data);
      
      if (data && data.length > 0) {
        const deskIds = data.map(item => item.desk_id);
        console.log(`[desk.model] getAgentDesks - extracted desk IDs:`, deskIds);
        
        const { data: desks, error: desksError } = await supabase
          .from('desks')
          .select('*')
          .in('id', deskIds)
          .order('created_at', { ascending: false });
          
        if (desksError) {
          console.error(`[desk.model] getAgentDesks - Error fetching desks:`, desksError);
          throw desksError;
        }
        
        console.log(`[desk.model] getAgentDesks - final desks result:`, desks);
        return desks || [];
      }
      
      console.log(`[desk.model] getAgentDesks - no desk assignments found for user ID: ${userId}`);
      return [];
    } catch (error) {
      console.error(`[desk.model] getAgentDesks - Caught error:`, error);
      throw new Error(`Error getting agent desks: ${error.message}`);
    }
  },
  
  // Unassign agent from desk
  unassignAgent: async (deskId, userId) => {
    try {
      const { data, error } = await supabase
        .from('desk_assignments')
        .delete()
        .match({ desk_id: deskId, user_id: userId })
        .select();

      if (error) throw error;
      // Check if any row was actually deleted
      if (data && data.length > 0) {
        return { success: true, message: 'Agent unassigned successfully.', unassignedAssignment: data[0] };
      } else {
        return { success: false, message: 'No assignment found for this agent and desk, or already unassigned.' };
      }
    } catch (error) {
      throw new Error(`Error unassigning agent from desk: ${error.message}`);
    }
  },

  // Get agents assigned to a desk
  getDeskAgents: async (deskId) => {
    try {
      const { data, error } = await supabase
        .from('desk_assignments')
        .select('users:user_id(*)')
        .eq('desk_id', deskId);
      
      if (error) throw error;
      
      // Extract the user objects from the joined query
      return data ? data.map(item => item.users) : [];
    } catch (error) {
      throw new Error(`Error getting desk agents: ${error.message}`);
    }
  }
};

module.exports = Desk;
