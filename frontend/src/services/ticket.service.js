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
  getTickets: async (deskId) => {
    try {
      // If deskId is an object, it's assumed to contain filters
      const filters = typeof deskId === 'object' ? deskId : { desk_id: deskId };
      
      const response = await API.get('/tickets', {
        params: filters
      });
      
      // Return the data directly for consistency
      return Array.isArray(response.data) ? response.data : 
             Array.isArray(response.data?.data) ? response.data.data : [];
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get tickets by status
  getTicketsByStatus: async (deskId, status) => {
    try {
      const response = await API.get('/tickets', {
        params: { 
          desk_id: deskId,
          status: status 
        }
      });
      
      return Array.isArray(response.data) ? response.data : 
             Array.isArray(response.data?.data) ? response.data.data : [];
    } catch (error) {
      console.error(`Error fetching ${status} tickets:`, error);
      throw error.response ? error.response.data : error.message;
    }
  },
  
  // Get messages for a ticket
  getTicketMessages: async (ticketId, conversationId) => {
    try {
      // Ensure that at least one identifier is provided
      if (!ticketId && !conversationId) {
        throw new Error('Ticket ID or Conversation ID must be provided to fetch messages.');
      }

      let endpoint = '';
      if (ticketId) {
        endpoint = `/tickets/${ticketId}/messages`;
      } else if (conversationId) {
        // Fallback to conversationId if ticketId is not available
        // Using the emails conversation endpoint as this is what's available in the backend
        // Note: This assumes conversationId can be treated as a ticketId in the backend endpoint
        endpoint = `/emails/conversation/${conversationId}`; 
      }

      console.log(`[TicketService] Fetching messages from endpoint: ${endpoint}`);
      const response = await API.get(endpoint);
      
      // Ensure response.data is an array, default to empty array if not
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('[TicketService] Error fetching ticket messages:', error.response ? error.response.data : error.message);
      // Return empty array on error to prevent UI crashes
      return []; 
    }
  },

  // Request feedback for a ticket
  requestTicketFeedback: async (ticketId) => {
    try {
      console.log(`[TicketService] Requesting feedback for ticket ID: ${ticketId}`);
      // This will call your backend endpoint. Example: POST /api/tickets/:ticketId/request-feedback
      // The backend should handle sending the email and updating the ticket record with feedback_requested_at and feedback_token.
      const response = await API.post(`/tickets/${ticketId}/request-feedback`);
      console.log('[TicketService] Feedback request response:', response.data);
      return response.data; // Or true/false based on success
    } catch (error) {
      console.error('[TicketService] Error requesting ticket feedback:', error.response ? error.response.data : error.message);
      throw error.response ? error.response.data : error.message;
    }
  },
};

export default TicketService;
