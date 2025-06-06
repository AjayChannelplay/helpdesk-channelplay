const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const authJwt = require('../middlewares/authJwt');

// Public route for handling feedback from email links
router.get('/submit', feedbackController.processFeedback);

// Protected routes for admin/reporting features
router.use(authJwt.verifyToken);

// Admin routes for dashboard/reporting
router.get('/stats', authJwt.isAdmin, feedbackController.getFeedbackStats);
router.get('/distribution', authJwt.isAdmin, feedbackController.getFeedbackDistribution);

// Routes for agents to see feedback on their tickets
router.get('/ticket/:ticketId', feedbackController.getTicketFeedback);

module.exports = router;
