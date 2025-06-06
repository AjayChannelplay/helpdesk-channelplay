const axios = require('axios');
const { supabase } = require('../config/db.config');

// Helper function to get Microsoft Graph API access token for a desk
async function getMicrosoftAccessToken(deskId) {
  try {
    console.log('Getting Microsoft access token for desk:', deskId);
    
    // Get integration details for the desk
    const { data: integration, error } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('desk_id', deskId)
      .single();
    
    console.log('Integration fetch result:', error ? 'Error' : 'Success');
    
    if (error) {
      console.error('Integration fetch error:', error.message);
      // If this is due to the Supabase API key issue, this will fail.
      if (error.message.includes('Invalid API key')) {
        console.error("[Utils] CRITICAL: Supabase API key is invalid. Cannot fetch email integration for token refresh.");
      }
      throw new Error(`No email integration found for this desk: ${error.message}`);
    }
    
    if (!integration) {
      console.error('No integration data found for desk ID:', deskId);
      throw new Error('No email integration found for this desk');
    }
    
    console.log('Integration found:', { 
      id: integration.id,
      desk_id: integration.desk_id,
      provider: integration.provider,
      hasAccessToken: !!integration.access_token,
      hasRefreshToken: !!integration.refresh_token
    });
    
    if (!integration.access_token) {
      throw new Error('Access token not available. Please authenticate with Microsoft.');
    }
    
    // Check if token is expired
    const tokenExpiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    
    if (now >= tokenExpiresAt) {
      console.log(`[Utils] Microsoft token for desk ${deskId} expired or will expire soon. Refreshing...`);
      // Token is expired, refresh it
      if (!integration.refresh_token) {
        throw new Error('Refresh token not available. Please re-authenticate with Microsoft.');
      }
      
      // Exchange refresh token for new access token
      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: integration.client_id,
          client_secret: integration.client_secret,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
          scope: 'Mail.Read Mail.Send offline_access User.Read' // Ensure scope matches original auth
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      // Update integration with new tokens
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Calculate new expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in - 300); // Subtract 5 mins for buffer
      
      const { error: updateError } = await supabase
        .from('email_integrations')
        .update({
          access_token,
          refresh_token, // Microsoft might issue a new refresh token
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);

      if (updateError) {
        console.error(`[Utils] Error updating Microsoft token in DB for desk ${deskId}:`, updateError.message);
        // If this is due to the Supabase API key issue, this will fail.
        if (updateError.message.includes('Invalid API key')) {
          console.error("[Utils] CRITICAL: Supabase API key is invalid. Cannot update email integration with new token.");
        }
        // Decide if you want to throw here or return the (new but not saved) access_token
      }
      
      console.log(`[Utils] Microsoft token for desk ${deskId} refreshed successfully.`);
      return access_token;
    }
    
    return integration.access_token;
  } catch (error) {
    console.error('Error getting Microsoft access token:', error.message, error.stack);
    // Check if it's an Axios error for more details
    if (error.isAxiosError && error.response) {
      console.error('Axios error details:', error.response.data);
    }
    throw error;
  }
}

module.exports = {
  getMicrosoftAccessToken
};
