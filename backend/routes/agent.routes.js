const express = require('express');
const router = express.Router();
const AgentController = require('../controllers/agent.controller');
const { authJwt } = require('../middlewares');

// Apply authentication middleware to all agent routes
router.use(authJwt.verifyToken);

// Agent performance statistics
router.get('/:agentId/stats', AgentController.getAgentStats);

// Agent feedback details
router.get('/:agentId/feedback', AgentController.getAgentFeedback);

// Agent performance for a specific desk
router.get('/:agentId/desk-performance', AgentController.getAgentDeskPerformance);

module.exports = router;
