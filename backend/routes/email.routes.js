const express = require('express');
const router = express.Router();
const emailController = require('../controllers/email.controller');
const authJwt = require('../middlewares/authJwt');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage: storage });

// Microsoft Graph webhook notification route - no auth required for external webhooks
router.post('/webhook/notification', express.json(), emailController.handleIncomingNotification);

// Apply authentication middleware to all other routes
router.use(authJwt.verifyToken);

// Send email for a ticket
router.post('/send/:ticketId', upload.array('attachments'), emailController.sendEmail);

// Fetch all emails
router.get('/', emailController.fetchEmails);

// Fetch unread emails
router.get('/unread', emailController.fetchUnreadEmails);

// Fetch email conversation for a ticket
router.get('/conversation/:ticketId', emailController.fetchConversation);

// Reply directly to an email without creating a ticket
router.post('/:emailId/reply', upload.array('attachments'), emailController.replyToEmail);

// Mark email as read
router.post('/mark-read/:emailId', emailController.markAsRead);

// Resolve a ticket with feedback options
router.post('/:emailId/resolve', emailController.resolveTicket);

// Get attachment for an email
router.get('/:emailId/attachments/:attachmentId', emailController.getAttachment);

module.exports = router;
