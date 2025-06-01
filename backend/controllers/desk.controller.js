const { supabase } = require('../config/db.config');

// Get all desks with their email integration status (similar to macOS Mail app)
exports.getAllDesks = async (req, res) => {
  try {
    // Get desks with their email integrations joined
    const { data, error } = await supabase
      .from('desks')
      .select(`
        *,
        email_integrations(*)
      `);
    
    if (error) throw error;
    
    // Transform the data to include integration status
    const transformedData = data.map(desk => {
      // Check if there's an active integration
      const hasIntegration = desk.email_integrations && 
                          desk.email_integrations.length > 0 && 
                          desk.email_integrations[0].access_token;
      
      // Create a simplified integration object
      const integration = hasIntegration ? {
        id: desk.email_integrations[0].id,
        provider_type: desk.email_integrations[0].provider_type,
        email_address: desk.email_integrations[0].email_address,
        connected: true
      } : null;
      
      // Return the desk with simplified integration info
      return {
        ...desk,
        email_integration: integration,
        email_integrations: undefined // Remove the detailed array
      };
    });
    
    res.status(200).json(transformedData);
  } catch (error) {
    console.error('Error fetching desks with integrations:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get desk by id
exports.getDeskById = async (req, res) => {
  try {
    const desk = await Desk.findById(req.params.id);
    
    if (!desk) {
      return res.status(404).json({ message: 'Desk not found' });
    }
    
    // Get email integration if exists
    const emailIntegration = await EmailIntegration.findByDeskId(req.params.id);
    
    // Get assigned agents
    const agents = await Desk.getAgentDesks(req.params.id);
    
    res.status(200).json({ 
      desk: {
        ...desk,
        email_integration: emailIntegration,
        agents
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error getting desk',
      error: error.message 
    });
  }
};

// Create desk
exports.createDesk = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Create desk with Supabase
    const { data: newDesk, error } = await supabase
      .from('desks')
      .insert([
        { 
          name,
          description,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (error) throw error;
    
    res.status(201).json({
      message: 'Desk created successfully',
      desk: newDesk[0]
    });
  } catch (error) {
    console.error('Error creating desk:', error);
    res.status(500).json({ 
      message: 'Error creating desk',
      error: error.message 
    });
  }
};

// Update desk
exports.updateDesk = async (req, res) => {
  try {
    const { name, description } = req.body;
    const deskId = req.params.id;
    
    // Check if desk exists
    const { data: desk, error: findError } = await supabase
      .from('desks')
      .select('*')
      .eq('id', deskId)
      .single();
    
    if (findError || !desk) {
      return res.status(404).json({ message: 'Desk not found' });
    }
    
    // Update desk
    const { data: updatedDesk, error: updateError } = await supabase
      .from('desks')
      .update({ 
        name, 
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', deskId)
      .select();
    
    if (updateError) throw updateError;
    
    res.status(200).json({
      message: 'Desk updated successfully',
      desk: updatedDesk[0]
    });
  } catch (error) {
    console.error('Error updating desk:', error);
    res.status(500).json({ 
      message: 'Error updating desk',
      error: error.message 
    });
  }
};

// Delete desk
exports.deleteDesk = async (req, res) => {
  try {
    const deskId = req.params.id;
    
    // Check if desk exists
    const { data: desk, error: findError } = await supabase
      .from('desks')
      .select('*')
      .eq('id', deskId)
      .single();
    
    if (findError || !desk) {
      return res.status(404).json({ message: 'Desk not found' });
    }
    
    // Delete desk
    const { error: deleteError } = await supabase
      .from('desks')
      .delete()
      .eq('id', deskId);
    
    if (deleteError) throw deleteError;
    
    res.status(200).json({
      message: 'Desk deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting desk:', error);
    res.status(500).json({ 
      message: 'Error deleting desk',
      error: error.message 
    });
  }
};

// Assign agent to desk
exports.assignAgent = async (req, res) => {
  try {
    const { user_id } = req.body;
    const deskId = req.params.id;
    
    // Check if desk exists
    const { data: desk, error: findError } = await supabase
      .from('desks')
      .select('*')
      .eq('id', deskId)
      .single();
    
    if (findError || !desk) {
      return res.status(404).json({ message: 'Desk not found' });
    }
    
    // Assign agent - assuming there's a desk_agents join table
    const { error: assignError } = await supabase
      .from('desk_agents')
      .upsert([
        { 
          desk_id: deskId, 
          user_id: user_id,
          created_at: new Date().toISOString() 
        }
      ]);
    
    if (assignError) throw assignError;
    
    res.status(200).json({
      message: 'Agent assigned successfully'
    });
  } catch (error) {
    console.error('Error assigning agent:', error);
    res.status(500).json({ 
      message: 'Error assigning agent',
      error: error.message 
    });
  }
};

// Get desks assigned to an agent
exports.getAssignedDesks = async (req, res) => {
  try {
    // Get desks assigned to the current user through the join table
    const { data, error } = await supabase
      .from('desk_agents')
      .select(`
        desk_id,
        desks(*)
      `)
      .eq('user_id', req.userId);
    
    if (error) throw error;
    
    // Transform data to just return desk objects
    const desks = data.map(item => item.desks);
    
    res.status(200).json({ desks });
  } catch (error) {
    console.error('Error fetching assigned desks:', error);
    res.status(500).json({ 
      message: 'Error fetching assigned desks',
      error: error.message 
    });
  }
};
