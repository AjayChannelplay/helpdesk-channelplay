const User = require('../models/user.model');
const Desk = require('../models/desk.model');
const bcrypt = require('bcrypt');

// User Management
exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const newUser = await User.create({ username, email, password, role: role || 'agent' });
    // Omit password from response
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ message: 'User created successfully.', user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user.', error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users.', error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    let userResponse = { ...user };
    if (user.role === 'agent') {
      const assignedDesks = await Desk.getAgentDesks(user.id);
      userResponse.assignedDesks = assignedDesks || [];
    }

    res.status(200).json(userResponse);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user.', error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { username, email, role } = req.body;
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (role) updateData.role = role;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No update data provided.' });
    }

    const updatedUser = await User.update(userId, updateData);
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found or no changes made.' });
    }
    res.status(200).json({ message: 'User updated successfully.', user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user.', error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const deletedUser = await User.delete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user.', error: error.message });
  }
};

// Desk Management (related to users)
exports.getAllDesks = async (req, res) => {
  try {
    const desks = await Desk.findAll();
    res.status(200).json(desks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching desks.', error: error.message });
  }
};

exports.assignUserToDesk = async (req, res) => {
  try {
    const { userId, deskId } = req.body;
    if (!userId || !deskId) {
      return res.status(400).json({ message: 'User ID and Desk ID are required.' });
    }
    console.log(`[admin.controller] assignUserToDesk - Assigning user ID: ${userId} to desk ID: ${deskId}`);
    const assignment = await Desk.assignAgent(deskId, userId);
    console.log(`[admin.controller] assignUserToDesk - Assignment result:`, assignment);
    res.status(201).json({ message: 'User assigned to desk successfully.', assignment });
  } catch (error) {
    // Check for unique constraint violation (already assigned)
    if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
        return res.status(409).json({ message: 'User is already assigned to this desk.' });
    }
    res.status(500).json({ message: 'Error assigning user to desk.', error: error.message });
  }
};

exports.unassignUserFromDesk = async (req, res) => {
  try {
    const { userId, deskId } = req.body; // Or req.params if you prefer route params
    if (!userId || !deskId) {
      return res.status(400).json({ message: 'User ID and Desk ID are required.' });
    }
    const result = await Desk.unassignAgent(deskId, userId);
    if (!result.success) {
        return res.status(404).json({ message: result.message });
    }
    res.status(200).json({ message: 'User unassigned from desk successfully.', details: result });
  } catch (error) {
    res.status(500).json({ message: 'Error unassigning user from desk.', error: error.message });
  }
};

exports.getUserAssignments = async (req, res) => {
    try {
        const userId = req.params.userId;
        const assignments = await Desk.getAgentDesks(userId);
        if (!assignments) {
            return res.status(404).json({ message: 'No assignments found for this user or user not found.' });
        }
        res.status(200).json(assignments);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user assignments.', error: error.message });
    }
};


