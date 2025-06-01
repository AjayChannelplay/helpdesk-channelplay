import axios from 'axios';
import AuthService from './auth.service';

const API_URL = 'http://localhost:3001/api';

const TicketService = {
  // Get all tickets
  getAllTickets: async (filters = {}) => {
    try {
      const response = await axios.get(`${API_URL}/tickets`, {
        params: filters,
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get ticket by id
  getTicketById: async (id) => {
    try {
      const response = await axios.get(`${API_URL}/tickets/${id}`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Create new ticket
  createTicket: async (ticketData) => {
    try {
      const response = await axios.post(`${API_URL}/tickets`, ticketData, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Update ticket
  updateTicket: async (id, ticketData) => {
    try {
      const response = await axios.put(`${API_URL}/tickets/${id}`, ticketData, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Reply to ticket
  replyToTicket: async (id, replyData) => {
    try {
      const response = await axios.post(`${API_URL}/tickets/${id}/reply`, replyData, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Delete ticket
  deleteTicket: async (id) => {
    try {
      const response = await axios.delete(`${API_URL}/tickets/${id}`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get ticket metrics
  getTicketMetrics: async () => {
    try {
      const response = await axios.get(`${API_URL}/tickets/metrics`, {
        headers: AuthService.getAuthHeader()
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Create a ticket from an email
  createTicketFromEmail: async (emailId, deskId) => {
    try {
      const response = await axios.post(`${API_URL}/tickets/from-email`, 
        { 
          email_id: emailId,
          desk_id: deskId 
        },
        { headers: AuthService.getAuthHeader() }
      );
      
      return response;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get tickets by desk ID
  getTickets: async (filters) => {
    try {
      const response = await axios.get(`${API_URL}/tickets`, {
        params: filters,
        headers: AuthService.getAuthHeader()
      });
      
      return response;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
};

export default TicketService;
