import API from './api.service';

const AdminService = {
  // User Management
  getAllUsers: async () => {
    try {
      const response = await API.get('/admin/users');
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  getUserById: async (userId) => {
    try {
      const response = await API.get(`/admin/users/${userId}`);
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
      const response = await API.put(`/admin/users/${userId}`, updateData);
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  deleteUser: async (userId) => {
    try {
      const response = await API.delete(`/admin/users/${userId}`);
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  // Desk Management (related to users)
  getAllDesks: async () => {
    try {
      const response = await API.get('/admin/desks');
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  assignUserToDesk: async (userId, deskId) => {
    try {
      const response = await API.post('/admin/desks/assign', { userId, deskId });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  unassignUserFromDesk: async (userId, deskId) => {
    try {
      // Backend expects userId and deskId in the body for POST for unassign
      const response = await API.post('/admin/desks/unassign', { userId, deskId });
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },

  getUserAssignments: async (userId) => {
    try {
      const response = await API.get(`/admin/users/${userId}/assignments`);
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
};

export default AdminService;
