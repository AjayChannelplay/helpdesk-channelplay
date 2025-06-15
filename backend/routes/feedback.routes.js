const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const authJwt = require('../middlewares/authJwt');

// Public routes for handling feedback from email links
router.get('/form', feedbackController.showFeedbackForm);  // Show the feedback form
router.get('/process', feedbackController.processFeedback); // Process the submitted feedback

// Backward compatibility route for old links in emails
router.get('/submit', (req, res) => {
  // Redirect to the form route with the same query parameters
  res.redirect(`/api/feedback/form${req.url.substring(req.url.indexOf('?'))}`); 
});

// Protected routes for admin/reporting features
router.use(authJwt.verifyToken);

// Admin routes for dashboard/reporting
router.get('/stats', authJwt.isAdmin, feedbackController.getFeedbackStats);
router.get('/distribution', authJwt.isAdmin, feedbackController.getFeedbackDistribution);

// Routes for agents to see feedback on their tickets
router.get('/ticket/:ticketId', feedbackController.getTicketFeedback);

module.exports = router;
