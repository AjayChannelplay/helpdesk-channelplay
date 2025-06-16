const axios = require('axios');
const { supabase } = require('../config/db.config');
const dotenv = require('dotenv');

dotenv.config();

// Default Microsoft OAuth scopes
const DEFAULT_MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send'
];

// Default redirect URI matching exactly what's registered in Azure
const DEFAULT_REDIRECT_URI = 'http://localhost:3001/api/auth/microsoft/callback';

// Generate Microsoft OAuth authorization URL (Step 1 of OAuth2 flow)
exports.getMicrosoftAuthUrl = async (req, res) => {
  try {
    // Get desk ID from either query parameter or URL parameter
    const deskId = req.query.deskId || req.params.integrationId;
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }

    // Get desk details and its OAuth configuration
    const { data: desk } = await supabase.from('desks').select('*').eq('id', deskId).single();
    
    if (!desk) {
      return res.status(404).json({ message: 'Desk not found' });
    }
    
    // Get the integration settings
    const { data: integration } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', deskId)
      .maybeSingle();
    
    // Check if we have client credentials
    if (!integration || !integration.client_id || !integration.client_secret) {
      return res.status(400).json({ message: 'OAuth credentials not configured for this desk' });
    }
    
    // Set up redirect URI - using a default since there's no redirect_uri column in the schema
    const redirectUri = DEFAULT_REDIRECT_URI;
    
    // Get the email from query params if available
    const emailHint = req.query.email;
    
    // Set up OAuth parameters
    const params = new URLSearchParams({
      client_id: integration.client_id,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: DEFAULT_MICROSOFT_SCOPES.join(' '),
      state: deskId, // Pass desk ID as state for callback identification
      prompt: 'login' // Force login prompt every time
    });
    
    // Only add login_hint if email is provided
    if (emailHint && emailHint.includes('@')) {
      params.append('login_hint', emailHint);
      console.log(`Adding login_hint with email: ${emailHint}`);
    }
    
    // Create Microsoft OAuth URL with explicit encoding of parameters
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    
    // For debugging
    console.log('Generated Microsoft OAuth URL:', authUrl);
    
    // Return the authorization URL to the frontend
    res.status(200).json({ authUrl });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error generating Microsoft authorization URL',
      error: error.message 
    });
  }
};

// Handle Microsoft OAuth callback (Step 3 of OAuth2 flow)
exports.handleMicrosoftCallback = async (req, res) => {
  console.log('===== MICROSOFT OAUTH CALLBACK =====');
  console.log('Request query params:', req.query);
  try {
    // Get authorization code, state, and other optional params from query params
    const { code, state, createDesk, deskName } = req.query;
  
    if (!code || !state) {
      return res.status(400).json({ message: 'Authorization code and state are required' });
    }
  
    // Parse state parameter which could be a JSON string or direct ID
    let deskId;
    try {
      // Try to parse as JSON first
      const stateObj = JSON.parse(state);
      deskId = stateObj.deskId;
      console.log('Parsed state as JSON:', stateObj);
    } catch (e) {
      // If not JSON, use directly as deskId
      deskId = state;
      console.log('Using state directly as deskId:', deskId);
    }
  
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID not found in state parameter' });
    }
    
    // Get the integration settings for this desk
    const { data: integration } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', deskId)
      .maybeSingle();
    
    if (!integration) {
      return res.status(404).json({ message: 'Integration not found for this desk' });
    }
    
    // Set up redirect URI - use the one from environment variables
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
    
    // Exchange the authorization code for tokens with exact match of registered redirect URI
    console.log('Exchanging code for tokens with redirect URI from env:', redirectUri); // Log the URI from env
    console.log('Using client_id:', integration.client_id);
    
    let tokenRes;
    try {
      tokenRes = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: integration.client_id,
          scope: DEFAULT_MICROSOFT_SCOPES.join(' '),
          code: code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          client_secret: integration.client_secret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log('Token exchange successful!');
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError.response?.data || tokenError.message);
      throw new Error(`Token exchange failed: ${tokenError.response?.data?.error_description || tokenError.message}`);
    }
    
    // Get the tokens from the response
    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
      token_type
    } = tokenRes.data;
    
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
    
    // Get user email from Microsoft Graph API
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    const email = userResponse.data.mail || userResponse.data.userPrincipalName;
    
    // Store tokens in database
    console.log('Storing tokens for integration ID:', integration.id);
    console.log('Access token exists:', !!access_token);
    console.log('Refresh token exists:', !!refresh_token);
    console.log('Email address:', email);
    
    // Log token details without exposing full tokens
    if (access_token) {
      console.log('Access token length:', access_token.length);
      console.log('Access token prefix:', access_token.substring(0, 10) + '...');
    }
    
    const updatePayload = {
      access_token,
      refresh_token,
      token_expires_at: expiresAt.toISOString(),
      email_address: email,
      updated_at: new Date().toISOString()
    };
    
    console.log('Update payload keys:', Object.keys(updatePayload));
    
    try {
      const { data: updatedIntegration, error: updateError } = await supabase
        .from('email_integrations')
        .update(updatePayload)
        .eq('id', integration.id)
        .select()
        .single();
        
      if (updateError) {
        console.error('Error updating integration with tokens:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      } else {
        console.log('Successfully updated integration with tokens');
        console.log('Updated integration:', updatedIntegration ? 'exists' : 'null');
      }
    } catch (dbError) {
      console.error('Database error when storing tokens:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }
    
    // Update desk email if not set
    const { data: desk } = await supabase
      .from('desks')
      .select('email_address')
      .eq('id', deskId)
      .single();
    
    if (!desk?.email_address) {
      await supabase
        .from('desks')
        .update({ email_address: email })
        .eq('id', deskId);
    }
    
    // Create a new desk after successful authentication
    let finalDeskId = deskId;
    const shouldCreateDesk = createDesk === 'true' && deskName;
    
    if (shouldCreateDesk) {
      console.log('Creating new desk with name:', deskName, 'and email:', email);
      try {
        // Create a new desk with the authenticated email
        const newDeskData = {
          name: deskName,
          email_address: email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        console.log('New desk data:', newDeskData);
        
        const { data: newDesk, error: deskError } = await supabase
          .from('desks')
          .insert(newDeskData)
          .select()
          .single();
        
        console.log('New desk created:', newDesk);
          
        if (deskError) {
          console.error('Error creating new desk:', deskError);
        } else if (newDesk) {
          console.log('Created new desk:', newDesk.id);
          finalDeskId = newDesk.id;
          
          // Copy the OAuth credentials to the new desk
          const { error: integrationError } = await supabase
            .from('email_integrations')
            .insert({
              desk_id: newDesk.id,
              provider_type: integration.provider_type,
              client_id: integration.client_id,
              client_secret: integration.client_secret,
              access_token,
              refresh_token,
              token_expires_at: expiresAt.toISOString(),
              email_address: email,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            
          if (integrationError) {
            console.error('Error copying integration to new desk:', integrationError);
          }
        }
      } catch (deskCreateError) {
        console.error('Error in desk creation:', deskCreateError);
      }
    }
    
    // Create a success response and redirect to the desk management page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Redirect to the desk management page after successful authentication
    res.redirect(`${frontendUrl}/admin/desk-management?success=true&deskId=${finalDeskId}`);
    console.log(`Authentication successful, redirecting to desk management page`);
    
  } catch (error) {
    console.error('===== OAUTH CALLBACK ERROR =====');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    if (error.response) {
      console.error('API response error:', error.response.data);
      console.error('Status code:', error.response.status);
    }
    if (error.stack) {
      console.error('Error stack trace:', error.stack);
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const errorMsg = encodeURIComponent(error.response?.data?.error_description || error.message || 'Unknown error');
    res.redirect(`${frontendUrl}/admin/desk-management?error=true&message=${errorMsg}`);
  }
};

// Generate Gmail OAuth authorization URL
exports.getGmailAuthUrl = (req, res) => {
  try {
    const deskId = req.query.desk_id;
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required' });
    }
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      gmailOAuthConfig.clientId,
      gmailOAuthConfig.clientSecret,
      gmailOAuthConfig.redirectUri
    );
    
    // Generate authentication URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: gmailOAuthConfig.scopes,
      state: deskId,
      prompt: 'consent' // Force to get refresh_token every time
    });
    
    res.status(200).json({ authUrl });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error generating Gmail authorization URL',
      error: error.message 
    });
  }
};

// Refresh Microsoft OAuth token
exports.refreshMicrosoftToken = async (req, res) => {
  try {
    // Get desk ID from URL parameter or request body
    const deskId = req.params.deskId || req.body.deskId;
    
    if (!deskId) {
      return res.status(400).json({ message: 'Desk ID is required', success: false });
    }
    
    // Get the integration with its refresh token by desk_id
    const { data: integration } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', deskId)
      .single();
    
    if (!integration) {
      return res.status(404).json({ message: 'Integration not found for this desk', success: false });
    }
    
    if (!integration.refresh_token) {
      return res.status(400).json({ message: 'No refresh token available', success: false });
    }
    
    // Refresh the token using the refresh token flow (exactly as outlined)
    const refreshed = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: integration.client_id,
        client_secret: integration.client_secret,
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
        scope: 'https://graph.microsoft.com/.default'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    // Calculate new expiration date
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + refreshed.data.expires_in);
    
    // Update tokens in database
    const { error: updateError } = await supabase
      .from('email_integrations')
      .update({
        access_token: refreshed.data.access_token,
        refresh_token: refreshed.data.refresh_token || integration.refresh_token, // Some flows don't return a new refresh token
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('desk_id', deskId);
    
    if (updateError) {
      console.error('Error updating integration:', updateError);
      return res.status(500).json({
        message: 'Failed to update integration with new tokens',
        error: updateError.message,
        success: false
      });
    }
    
    res.status(200).json({
      message: 'Token refreshed successfully',
      expiresAt: expiresAt.toISOString(),
      success: true
    });
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to refresh token',
      error: error.response?.data?.error_description || error.message
    });
  }
};

// Handle Gmail OAuth callback
exports.handleGmailCallback = async (req, res) => {
  try {
    const { code, state: deskId } = req.query;
    
    if (!code || !deskId) {
      return res.status(400).json({ message: 'Authorization code and desk ID are required' });
    }
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      gmailOAuthConfig.clientId,
      gmailOAuthConfig.clientSecret,
      gmailOAuthConfig.redirectUri
    );
    
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Set credentials to OAuth2 client
    oauth2Client.setCredentials(tokens);
    
    // Get user email address
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profile.data.emailAddress;
    
    // Calculate token expiration time
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);
    
    // Check if email integration already exists for this desk
    const existingIntegration = await EmailIntegration.findByDeskId(deskId);
    
    if (existingIntegration) {
      // Update existing integration
      await EmailIntegration.update(existingIntegration.id, {
        provider_type: 'GMAIL',
        client_id: gmailOAuthConfig.clientId,
        client_secret: gmailOAuthConfig.clientSecret,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: expiresAt,
        email_address: emailAddress
      });
    } else {
      // Create new integration
      await EmailIntegration.create({
        desk_id: deskId,
        provider_type: 'GMAIL',
        client_id: gmailOAuthConfig.clientId,
        client_secret: gmailOAuthConfig.clientSecret,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: expiresAt,
        email_address: emailAddress
      });
    }
    
    // Redirect to frontend with success message
    res.redirect(`${process.env.FRONTEND_URL}/desks/${deskId}?integration=success`);
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/desks?error=gmail_auth_failed`);
  }
};
