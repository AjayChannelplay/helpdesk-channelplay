const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer'); // Add multer import here
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Configure CORS with explicit settings
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Only parse JSON and urlencoded data, not multipart/form-data
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Global multer error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  } else if (err) {
    console.error('Express error:', err);
    return res.status(500).json({ message: err.message });
  }
  next();
});

// Import routes
const authRoutes = require('./routes/auth.routes');
const ticketRoutes = require('./routes/ticket.routes');
const deskRoutes = require('./routes/desk.routes');
const userRoutes = require('./routes/user.routes');
const emailRoutes = require('./routes/email.routes');
const emailAuthRoutes = require('./routes/email-auth.routes');
const emailIntegrationRoutes = require('./routes/email-integration.routes');
const adminRoutes = require('./routes/admin.routes');
const healthRoutes = require('./routes/health.routes');
const feedbackRoutes = require('./routes/feedback.routes');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/desks', deskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/email-auth', emailAuthRoutes);
app.use('/api/email-integrations', emailIntegrationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);

// Special route for Microsoft OAuth callback to match the redirect URI in .env
app.get('/api/auth/microsoft/callback', (req, res) => {
  console.log('[server.js] Received Microsoft callback at /api/auth/microsoft/callback');
  // Forward this request to our email-auth controller
  require('./controllers/email-auth.controller').handleMicrosoftCallback(req, res);
});
app.use('/health', healthRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Channelplay Helpdesk API' });
});

// Import the email polling service
const { startPolling } = require('./services/emailPolling.service');

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Start the email polling service after the server is up
  startPolling();
});
