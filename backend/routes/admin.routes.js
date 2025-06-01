const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authJwt } = require('../middleware/auth.middleware');

// All routes in this file will be protected by verifyToken and isAdmin middleware
router.use(authJwt.verifyToken, authJwt.isAdmin);

// User Management Routes
router.post('/users', adminController.createUser);
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId', adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);

// Desk and Assignment Management Routes
router.get('/desks', adminController.getAllDesks); // List all desks for assignment UI
router.post('/desks/assign', adminController.assignUserToDesk);
router.post('/desks/unassign', adminController.unassignUserFromDesk);
router.get('/users/:userId/assignments', adminController.getUserAssignments); // Get desks assigned to a specific user

module.exports = router;
