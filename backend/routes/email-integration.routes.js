const express = require('express');
const router = express.Router();
const { supabase } = require('../config/db.config');
const authMiddleware = require('../middleware/auth.middleware');

// Get all email integrations (admin only)
// Basic POST route for creating or updating email integrations
router.post('/', async (req, res) => {
  try {
    const { deskId, providerType, clientId, clientSecret, redirectUri, tenantId } = req.body;
    
    if (!deskId || !clientId || !clientSecret) {
      return res.status(400).json({ message: 'Missing required fields: deskId, clientId, and clientSecret are required' });
    }
    
    // Check if an integration already exists for this desk
    const { data: existingIntegration } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', deskId)
      .maybeSingle();
    
    let data, error;
    
    if (existingIntegration) {
      // Update existing integration
      console.log('Updating existing integration for desk:', deskId);
      const { data: updatedData, error: updateError } = await supabase
        .from('email_integrations')
        .update({
          provider_type: providerType || existingIntegration.provider_type,
          client_id: clientId,
          client_secret: clientSecret,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingIntegration.id)
        .select()
        .single();
      
      data = updatedData;
      error = updateError;
    } else {
      // Create a new integration
      console.log('Creating new integration for desk:', deskId);
      const { data: newData, error: insertError } = await supabase
        .from('email_integrations')
        .insert([{
          desk_id: deskId,
          provider_type: providerType || 'MICROSOFT',
          client_id: clientId,
          client_secret: clientSecret,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      data = newData;
      error = insertError;
    }
    
    if (error) {
      console.error('Error creating integration:', error);
      return res.status(500).json({ message: 'Failed to create integration', error: error.message });
    }
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Error in POST /email-integrations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_integrations')
      .select('*');
      
    if (error) throw error;
    
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      message: 'Error retrieving email integrations',
      error: error.message
    });
  }
});

// Get email integration by desk ID
router.get('/desk/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', req.params.id)
      .maybeSingle();
      
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ message: 'Email integration not found' });
    }
    
    // Remove sensitive data for non-admin users
    if (req.user.role !== 'admin') {
      delete data.client_secret;
      delete data.refresh_token;
    }
    
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      message: 'Error retrieving email integration',
      error: error.message
    });
  }
});

// Setup or update email integration (admin only)
router.post('/setup', async (req, res) => {
  try {
    const { 
      desk_id, 
      client_id, 
      client_secret, 
      redirect_uri, 
      tenant_id,
      provider_type = 'MICROSOFT' 
    } = req.body;
    
    if (!desk_id || !client_id || !client_secret) {
      return res.status(400).json({ 
        message: 'Desk ID, client ID, and client secret are required' 
      });
    }
    
    // Check if desk exists
    const { data: desk, error: deskError } = await supabase
      .from('desks')
      .select('*')
      .eq('id', desk_id)
      .single();
      
    if (deskError) {
      return res.status(404).json({ message: 'Desk not found' });
    }
    
    // Check if integration already exists
    const { data: existingIntegration, error: integrationError } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', desk_id)
      .maybeSingle();
      
    let data, error;
    
    if (existingIntegration) {
      // Update existing integration
      const updateData = {
        client_id,
        client_secret,
        provider_type,
        updated_at: new Date().toISOString()
      };
      
      if (redirect_uri) updateData.redirect_uri = redirect_uri;
      if (tenant_id) updateData.tenant_id = tenant_id;
      
      const result = await supabase
        .from('email_integrations')
        .update(updateData)
        .eq('id', existingIntegration.id)
        .select()
        .single();
        
      data = result.data;
      error = result.error;
    } else {
      // Create new integration
      const newIntegration = {
        desk_id,
        client_id,
        client_secret,
        provider_type,
        redirect_uri,
        tenant_id
      };
      
      const result = await supabase
        .from('email_integrations')
        .insert([newIntegration])
        .select()
        .single();
        
      data = result.data;
      error = result.error;
    }
    
    if (error) {
      return res.status(500).json({
        message: 'Error saving email integration',
        error: error.message
      });
    }
    
    res.status(200).json({
      message: 'Email integration saved successfully',
      data
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error setting up email integration',
      error: error.message
    });
  }
});

// Delete email integration (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_integrations')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) {
      return res.status(500).json({
        message: 'Error deleting email integration',
        error: error.message
      });
    }
    
    if (!data) {
      return res.status(404).json({ message: 'Email integration not found' });
    }
    
    res.status(200).json({
      message: 'Email integration deleted successfully',
      data
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error deleting email integration',
      error: error.message
    });
  }
});

module.exports = router;
