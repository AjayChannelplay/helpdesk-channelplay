const { supabase } = require('../config/supabase.config');
const bcrypt = require('bcrypt');

const User = {
  // Create a new user
  create: async (userData) => {
    const { username, email, password, role } = userData;
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([
          { username, email, password: hashedPassword, role: role || 'agent' }
        ])
        .select('id, username, email, role, created_at')
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  },
  
  // Find user by id
  findById: async (id) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, role, created_at')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  },
  
  // Find user by email
  findByEmail: async (email) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
      return data;
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  },
  
  // Find all users
  findAll: async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, role, created_at');
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error finding users: ${error.message}`);
    }
  },
  
  // Update user
  update: async (id, userData) => {
    const allowedFields = ['username', 'email', 'role'];
    const updateData = {};
    
    // Filter allowed fields
    for (const field of allowedFields) {
      if (userData[field] !== undefined) {
        updateData[field] = userData[field];
      }
    }
    
    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }
    
    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();
    
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select('id, username, email, role, created_at, updated_at')
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error updating user: ${error.message}`);
    }
  },
  
  // Delete user
  delete: async (id) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .delete()
        .eq('id', id)
        .select('id')
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  },
  
  // Validate password
  validatePassword: async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
};

module.exports = User;
