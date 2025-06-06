import API from './api.service';

const DeskService = {
  // Get all desks
  getAllDesks: async () => {
    try {
      const response = await API.get('/desks');
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get desk by id
  getDeskById: async (id) => {
    try {
      const response = await API.get(`/desks/${id}`);
      
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
      const response = await API.put(`/desks/${id}`, deskData);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Delete desk
  deleteDesk: async (id) => {
    try {
      const response = await API.delete(`/desks/${id}`);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Assign agent to desk
  assignAgentToDesk: async (deskId, userId) => {
    try {
      const response = await API.post(`/desks/${deskId}/assign`, {
        user_id: userId
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get desks assigned to an agent
  getAgentDesks: async () => {
    try {
      const response = await API.get('/desks/assigned');
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  }
};

export default DeskService;
