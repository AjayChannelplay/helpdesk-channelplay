const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticket.controller');
const { authJwt } = require('../middlewares');

// PUBLIC ROUTE - for customers clicking email links
// This route MUST be defined BEFORE auth middleware is applied generally
router.get('/feedback/submit', ticketController.submitFeedback);

// Apply authentication middleware to all subsequent routes in this router
router.use(authJwt.verifyToken);

// Authenticated Ticket routes
router.get('/', ticketController.getTickets);
router.post('/', ticketController.createTicket);
router.get('/metrics', ticketController.getTicketMetrics); // Assuming this needs auth
router.post('/from-email', ticketController.createTicketFromEmail); // Assuming this needs auth

// Route for requesting feedback email - needs auth
router.post('/:ticketId/request-feedback', ticketController.requestTicketFeedback);

router.get('/:id', ticketController.getTicketById);
router.put('/:id', ticketController.updateTicket);
router.delete('/:id', ticketController.deleteTicket);
router.post('/:id/reply', ticketController.replyToTicket);


module.exports = router;
