const express = require('express');
const router = express.Router();
const deskController = require('../controllers/desk.controller');
const { authJwt } = require('../middlewares');

// Apply authentication middleware to all routes
router.use(authJwt.verifyToken);

// Desk routes
router.get('/', deskController.getAllDesks);
router.post('/', deskController.createDesk);
router.get('/assigned', deskController.getAssignedDesks);
router.get('/:id', deskController.getDeskById);
router.put('/:id', deskController.updateDesk);
router.delete('/:id', deskController.deleteDesk);
router.post('/:id/assign', deskController.assignAgent);

module.exports = router;
