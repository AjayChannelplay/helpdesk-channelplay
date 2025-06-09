const User = require('../models/user.model');
const Desk = require('../models/desk.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Register new user
exports.register = async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findByEmail(req.body.email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Create new user
    const newUser = await User.create({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role || 'agent'
    });
    
    // Return user data without password
    res.status(201).json({
      message: 'User registered successfully',
      user: newUser
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error registering user',
      error: error.message 
    });
  }
};

// Login user
exports.login = async (req, res) => {
  console.log('[auth.controller] Login attempt received:', { email: req.body.email });
  try {
    // FOR DEMO PURPOSES: Allow login with test credentials without database check - TEMPORARILY DISABLED
    // if ((req.body.email === 'admin@example.com' && req.body.password === 'password123') ||
    //     (req.body.email === 'agent@example.com' && req.body.password === 'password')) {

    //   // Determine role based on email
    //   const role = req.body.email === 'admin@example.com' ? 'admin' : 'agent';
    //   const username = req.body.email === 'admin@example.com' ? 'Admin User' : 'Agent User';
      
    //   // Generate JWT token
    //   const token = jwt.sign(
    //     { id: role === 'admin' ? 1 : 2, role: role },
    //     process.env.JWT_SECRET || 'your_jwt_secret_key',
    //     { expiresIn: '24h' }
    //   );
      
    //   // For demo agent, simulate assigned desks
    //   let assignedDesksDemo = [];
    //   if (role === 'agent') {
    //     // Assuming 'Gmail Support' desk has ID 1 for demo purposes
    //     // In a real scenario, you might fetch this from a demo setup or a fixed configuration
    //     assignedDesksDemo = [{ id: 1, name: 'Gmail Support', /* other desk properties */ }]; 
    //   }

    //   // Return user data and token
    //   return res.status(200).json({
    //     message: 'Login successful (Demo)',
    //     user: {
    //       id: role === 'admin' ? 1 : 2,
    //       username: username,
    //       email: req.body.email,
    //       role: role,
    //       ...(role === 'agent' && { assignedDesks: assignedDesksDemo })
    //     },
    //     token
    //   });
    // }

    // Continue with normal login process if not using test credentials
    // Find user by email
    const user = await User.findByEmail(req.body.email);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Validate password
    const isPasswordValid = await User.validatePassword(req.body.password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: '24h' }
    );
    
    let assignedDesks = [];
    if (user.role === 'agent') {
      console.log(`[auth.controller] Agent login - fetching desks for user ID: ${user.id}`);
      assignedDesks = await Desk.getAgentDesks(user.id);
      console.log(`[auth.controller] Agent login - assigned desks:`, assignedDesks);
    }

    // Return user data and token with naming consistent with SSO endpoint
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.username || user.email.split('@')[0],
        display_name: user.display_name || user.name || user.username || user.email.split('@')[0],
        role: user.role,
        assignedDesks: assignedDesks || []
      },
      assignedDesks: assignedDesks || [],
      token
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error logging in',
      error: error.message 
    });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    // Find user by id from token
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return user data
    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error getting current user',
      error: error.message 
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    // Find user by id
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Validate current password
    const isPasswordValid = await User.validatePassword(req.body.currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.newPassword, salt);
    
    // Update password in database
    const query = `
      UPDATE users
      SET password = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `;
    
    await db.query(query, [hashedPassword, req.userId]);
    
    // Return success message
    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error changing password',
      error: error.message 
    });
  }
};
