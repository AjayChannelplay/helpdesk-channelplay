const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

verifyToken = (req, res, next) => {
  let token = req.headers['authorization'];
  
  if (!token) {
    return res.status(403).send({
      message: 'No token provided!'
    });
  }
  
  // Remove Bearer prefix if present
  if (token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }
  
  // Check if this is a mock token (for development only)
  if (token.startsWith('mock_jwt_token_')) {
    // Extract role from mock token
    const role = token.replace('mock_jwt_token_', '');
    // Set user data based on role
    if (role === 'admin') {
      req.userId = 1;
      req.userRole = 'admin';
      return next();
    } else if (role === 'agent') {
      req.userId = 2;
      req.userRole = 'agent';
      return next();
    }
  }
  
  // Verify real JWT tokens
  jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key', (err, decoded) => {
    if (err) {
      return res.status(401).send({
        message: 'Unauthorized!'
      });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  });
};

isAdmin = (req, res, next) => {
  User.findById(req.userId).then(user => {
    if (user && user.role === 'admin') {
      next();
      return;
    }
    
    res.status(403).send({
      message: 'Require Admin Role!'
    });
  });
};

const authJwt = {
  verifyToken,
  isAdmin
};

module.exports = authJwt;
