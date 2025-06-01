import axios from 'axios';
import AuthService from './auth.service';

const API_URL = 'http://localhost:3001/api';

const DeskService = {
  // Get all desks
  getAllDesks: async () => {
    try {
      const response = await axios.get(`${API_URL}/desks`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get desk by id
  getDeskById: async (id) => {
    try {
      const response = await axios.get(`${API_URL}/desks/${id}`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Create new desk
  createDesk: async (deskData) => {
    try {
      const response = await axios.post(`${API_URL}/desks`, deskData, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Update desk
  updateDesk: async (id, deskData) => {
    try {
      const response = await axios.put(`${API_URL}/desks/${id}`, deskData, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Delete desk
  deleteDesk: async (id) => {
    try {
      const response = await axios.delete(`${API_URL}/desks/${id}`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Assign agent to desk
  assignAgentToDesk: async (deskId, userId) => {
    try {
      const response = await axios.post(`${API_URL}/desks/${deskId}/assign`, {
        user_id: userId
      }, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get desks assigned to an agent
  getAgentDesks: async () => {
    try {
      const response = await axios.get(`${API_URL}/desks/assigned`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  }
};

export default DeskService;
