const jwt = require('jsonwebtoken');
const { supabase } = require('../config/db.config');

// Middleware to verify JWT token and attach user to request
const verifyToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, role')
      .eq('id', decoded.id)
      .single();
      
    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token or user not found.' });
    }
    
    // Attach user to request
    req.user = user;
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token.', error: error.message });
  }
};

// Middleware to check if user is an admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }
};

const authJwt = {
  verifyToken,
  isAdmin
};

module.exports = { authJwt };
