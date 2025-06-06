import API from './api.service';

const TicketService = {
  // Get all tickets
  getAllTickets: async (filters = {}) => {
    try {
      const response = await API.get('/tickets', {
        params: filters
      });
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get ticket by id
  getTicketById: async (id) => {
    try {
      const response = await API.get(`/tickets/${id}`);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Create new ticket
  createTicket: async (ticketData) => {
    try {
      const response = await API.post('/tickets', ticketData);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Update ticket
  updateTicket: async (id, ticketData) => {
    try {
      const response = await API.put(`/tickets/${id}`, ticketData);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Reply to ticket
  replyToTicket: async (id, replyData) => {
    try {
      const response = await API.post(`/tickets/${id}/reply`, replyData);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Delete ticket
  deleteTicket: async (id) => {
    try {
      const response = await API.delete(`/tickets/${id}`);
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get ticket metrics
  getTicketMetrics: async () => {
    try {
      const response = await API.get('/tickets/metrics');
      
      return response.data;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Create a ticket from an email
  createTicketFromEmail: async (emailId, deskId) => {
    try {
      const response = await API.post('/tickets/from-email', { 
        email_id: emailId,
        desk_id: deskId 
      });
      
      return response;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get tickets by desk ID
  getTickets: async (filters) => {
    try {
      const response = await API.get('/tickets', {
        params: filters
      });
      
      return response;
    } catch (error) {
      throw error.response ? error.response.data : error.message;
    }
  },
};

export default TicketService;
