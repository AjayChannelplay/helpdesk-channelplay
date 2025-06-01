const express = require('express');
const router = express.Router();
const emailAuthController = require('../controllers/email-auth.controller');

// Microsoft OAuth routes (no auth middleware for OAuth endpoints)
router.get('/microsoft/url', emailAuthController.getMicrosoftAuthUrl);

// Debug all requests to the callback endpoint
router.get('/microsoft/callback', (req, res) => {
  console.log('[email-auth.routes] Received callback request with query params:', req.query);
  return emailAuthController.handleMicrosoftCallback(req, res);
});

router.post('/microsoft/refresh/:integrationId', emailAuthController.refreshMicrosoftToken);

// Root callback (used by Microsoft after user authorizes)
router.get('/callback', (req, res) => {
  // This is the redirect URI Microsoft will use
  console.log('[email-auth.routes] Received root callback with query params:', req.query);
  return emailAuthController.handleMicrosoftCallback(req, res);
});

// Gmail OAuth routes
router.get('/gmail/auth-url', emailAuthController.getGmailAuthUrl);
router.get('/gmail/callback', emailAuthController.handleGmailCallback);

module.exports = router;
