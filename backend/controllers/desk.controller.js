const { supabase } = require('../config/db.config');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Default Microsoft OAuth scopes
const DEFAULT_MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send'
];

/**
 * Generate Microsoft OAuth authorization URL
 * @param {string} deskId - The desk ID
 * @param {string} clientId - Microsoft client ID
 * @param {string} redirectUri - OAuth redirect URI
 * @param {string} emailHint - Optional email to pre-fill
 * @returns {string} - Microsoft OAuth authorization URL
 */
const generateMicrosoftAuthUrl = (deskId, clientId, redirectUri, emailHint = null) => {
  try {
    // Define the scopes needed for email operations
    const scopes = DEFAULT_MICROSOFT_SCOPES.join(' ');
    
    // Set up the state parameter to track the desk after callback
    const state = JSON.stringify({ deskId });
    
    // Create Microsoft OAuth URL with explicit encoding of parameters
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
      response_mode: 'query',
      state: state
    });
    
    // Add email hint if provided
    if (emailHint) {
      params.append('login_hint', emailHint);
    }
    
    // Construct the final URL
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    
    return authUrl;
  } catch (error) {
    console.error('Error generating Microsoft auth URL:', error);
    return null;
  }
};

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

// Create desk with automatic Microsoft OAuth integration
exports.createDesk = async (req, res) => {
  try {
    const { name, description, email_address, provider_type = 'MICROSOFT' } = req.body;
    
    // Create desk with Supabase
    const { data: newDesk, error } = await supabase
      .from('desks')
      .insert([
        { 
          name,
          description,
          email_address,
          provider_type,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (error) throw error;
    
    // Automatically set up Microsoft OAuth credentials from environment variables
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5173/api/auth/microsoft/callback';
    
    if (!clientId || !clientSecret) {
      console.error('Microsoft OAuth credentials not found in environment variables');
      return res.status(201).json({
        message: 'Desk created successfully, but Microsoft OAuth credentials were not found in environment variables',
        desk: newDesk[0],
        oauthSetup: false
      });
    }
    
    // Create email integration with Microsoft OAuth credentials
    const { data: integration, error: integrationError } = await supabase
      .from('email_integrations')
      .insert([
        {
          desk_id: newDesk[0].id,
          provider_type: provider_type || 'MICROSOFT',
          client_id: clientId,
          client_secret: clientSecret,
          email_address: email_address,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (integrationError) {
      console.error('Error setting up Microsoft OAuth credentials:', integrationError);
      return res.status(201).json({
        message: 'Desk created successfully, but failed to set up Microsoft OAuth credentials',
        desk: newDesk[0],
        oauthSetup: false,
        error: integrationError.message
      });
    }
    
    // Calculate Microsoft authentication URL for immediate use
    const authUrl = generateMicrosoftAuthUrl(newDesk[0].id, clientId, redirectUri, email_address);
    
    res.status(201).json({
      message: 'Desk created successfully with Microsoft OAuth credentials',
      desk: newDesk[0],
      integration: integration[0],
      oauthSetup: true,
      authUrl: authUrl
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
