const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticket.controller');
const { authJwt } = require('../middlewares');

// Apply authentication middleware to all routes
router.use(authJwt.verifyToken);

// Ticket routes
router.get('/', ticketController.getTickets);
router.post('/', ticketController.createTicket);
router.get('/metrics', ticketController.getTicketMetrics);
router.post('/from-email', ticketController.createTicketFromEmail);
router.get('/:id', ticketController.getTicketById);
router.put('/:id', ticketController.updateTicket);
router.delete('/:id', ticketController.deleteTicket);
router.post('/:id/reply', ticketController.replyToTicket);

module.exports = router;
