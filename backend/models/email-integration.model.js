const { supabase } = require('../config/db.config');

const EmailIntegration = {
  // Create a new email integration using OAuth2
  create: async (integrationData) => {
    const {
      desk_id,
      provider_type, // 'GMAIL' or 'MICROSOFT'
      client_id,
      client_secret,
      refresh_token,
      access_token,
      token_expires_at,
      email_address
    } = integrationData;

    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .insert([
          {
            desk_id,
            provider_type,
            client_id,
            client_secret,
            refresh_token,
            access_token,
            token_expires_at,
            email_address
          }
        ])
        .select()
        .single(); // Assuming you want the created record back and it's unique

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating email integration:', error);
      throw new Error(`Error creating email integration: ${error.message}`);
    }
  },

  // Find email integration by desk id
  findByDeskId: async (deskId) => {
    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .select('*')
        .eq('desk_id', deskId)
        .limit(1)
        .single(); // .single() returns one object or null, errors if >1 row

      if (error) {
        // It's common for find operations to return null if not found, rather than throw
        if (error.code === 'PGRST116') { // PGRST116: 'The result contains 0 rows'
          return null;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error(`Error finding email integration by desk_id ${deskId}:`, error);
      throw new Error(`Error finding email integration: ${error.message}`);
    }
  },

  // Update email integration
  update: async (id, integrationData) => {
    const {
      provider_type,
      client_id,
      client_secret,
      refresh_token,
      access_token,
      token_expires_at,
      email_address
    } = integrationData;

    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .update({
          provider_type,
          client_id,
          client_secret,
          refresh_token,
          access_token,
          token_expires_at,
          email_address,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single(); // Assuming you want the updated record back

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error updating email integration ${id}:`, error);
      throw new Error(`Error updating email integration: ${error.message}`);
    }
  },

  // Update OAuth tokens
  updateOAuthTokens: async (deskId, tokenData) => {
    const { access_token, refresh_token, token_expires_at } = tokenData;

    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .update({
          access_token,
          refresh_token,
          token_expires_at,
          updated_at: new Date().toISOString()
        })
        .eq('desk_id', deskId) // Assuming desk_id is the correct identifier here
        .select()
        .single(); // Assuming one integration per desk_id

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error updating OAuth tokens for desk_id ${deskId}:`, error);
      throw new Error(`Error updating OAuth tokens: ${error.message}`);
    }
  },

  // Delete email integration
  delete: async (id) => {
    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .delete()
        .eq('id', id)
        .select()
        .single(); // To get the deleted record back, if needed

      if (error) throw error;
      return data; // Returns the deleted record
    } catch (error) {
      console.error(`Error deleting email integration ${id}:`, error);
      throw new Error(`Error deleting email integration: ${error.message}`);
    }
  }
};

module.exports = EmailIntegration;
