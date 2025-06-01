const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authJwt } = require('../middlewares');

// Apply authentication middleware to all routes
router.use(authJwt.verifyToken);

// Admin-only routes
router.get('/', [authJwt.isAdmin], userController.getAllUsers);
router.post('/', [authJwt.isAdmin], userController.createUser);
router.put('/:id', [authJwt.isAdmin], userController.updateUser);
router.delete('/:id', [authJwt.isAdmin], userController.deleteUser);

// User routes
router.get('/:id', userController.getUserById);

module.exports = router;
