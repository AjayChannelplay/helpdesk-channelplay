const db = require('../config/db.config');

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
    
    const query = `
      INSERT INTO email_integrations (
        desk_id, 
        provider_type,
        client_id,
        client_secret,
        refresh_token,
        access_token,
        token_expires_at,
        email_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [
        desk_id, 
        provider_type, 
        client_id,
        client_secret,
        refresh_token,
        access_token,
        token_expires_at,
        email_address
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating email integration: ${error.message}`);
    }
  },
  
  // Find email integration by desk id
  findByDeskId: async (deskId) => {
    const query = 'SELECT * FROM email_integrations WHERE desk_id = $1';
    try {
      const result = await db.query(query, [deskId]);
      return result.rows[0];
    } catch (error) {
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
    
    const query = `
      UPDATE email_integrations
      SET provider_type = $1, 
          client_id = $2,
          client_secret = $3,
          refresh_token = $4,
          access_token = $5,
          token_expires_at = $6,
          email_address = $7,
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [
        provider_type, 
        client_id,
        client_secret,
        refresh_token,
        access_token,
        token_expires_at,
        email_address,
        id
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating email integration: ${error.message}`);
    }
  },
  
  // Update OAuth tokens
  updateOAuthTokens: async (deskId, tokenData) => {
    const { access_token, refresh_token, token_expires_at } = tokenData;
    
    const query = `
      UPDATE email_integrations
      SET access_token = $1, 
          refresh_token = $2, 
          token_expires_at = $3,
          updated_at = NOW()
      WHERE desk_id = $4
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [
        access_token, 
        refresh_token, 
        token_expires_at, 
        deskId
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating OAuth tokens: ${error.message}`);
    }
  },
  
  // Delete email integration
  delete: async (id) => {
    const query = 'DELETE FROM email_integrations WHERE id = $1 RETURNING *';
    try {
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting email integration: ${error.message}`);
    }
  }
};

module.exports = EmailIntegration;
