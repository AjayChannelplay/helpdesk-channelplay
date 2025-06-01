import axios from 'axios';
import AuthService from './auth.service';
import { API_URL } from '../constants'; // Assuming you have API_URL in constants.js

const ADMIN_API_URL = `${API_URL}/admin`;

const AdminService = {
  // User Management
  getAllUsers: async () => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/users`, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  getUserById: async (userId) => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/users/${userId}`, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  createUser: async (userData) => {
    try {
      const response = await axios.post(`${ADMIN_API_URL}/users`, userData, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  updateUser: async (userId, updateData) => {
    try {
      const response = await axios.put(`${ADMIN_API_URL}/users/${userId}`, updateData, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  deleteUser: async (userId) => {
    try {
      const response = await axios.delete(`${ADMIN_API_URL}/users/${userId}`, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  // Desk Management (related to users)
  getAllDesks: async () => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/desks`, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  assignUserToDesk: async (userId, deskId) => {
    try {
      const response = await axios.post(`${ADMIN_API_URL}/desks/assign`, { userId, deskId }, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  unassignUserFromDesk: async (userId, deskId) => {
    try {
      // Backend expects userId and deskId in the body for POST for unassign
      const response = await axios.post(`${ADMIN_API_URL}/desks/unassign`, { userId, deskId }, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  getUserAssignments: async (userId) => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/users/${userId}/assignments`, {
        headers: AuthService.getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
};

export default AdminService;
