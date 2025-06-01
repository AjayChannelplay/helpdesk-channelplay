const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authJwt } = require('../middlewares');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/current-user', [authJwt.verifyToken], authController.getCurrentUser);
router.post('/change-password', [authJwt.verifyToken], authController.changePassword);

// Microsoft OAuth2 callback route - redirects to the email-auth controller
router.get('/microsoft/callback', (req, res) => {
  console.log('[auth.routes] Received Microsoft callback with query params:', req.query);
  
  // Add timestamp for debugging
  const timestamp = new Date().toISOString();
  const queryParams = {...req.query, timestamp};
  
  // Redirect to the email-auth controller with the same query parameters
  const queryString = Object.entries(queryParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value || '')}`)
    .join('&');
  
  console.log('[auth.routes] Redirecting to email-auth callback with:', queryString);
  res.redirect(`/api/email-auth/microsoft/callback?${queryString}`);
});

module.exports = router;
