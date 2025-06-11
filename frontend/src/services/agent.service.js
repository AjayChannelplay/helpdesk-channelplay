import API from './api.service';

/**
 * Service for agent operations, statistics and metrics
 */
const AgentService = {
  /**
   * Get agent performance statistics
   * @param {string} agentId - UUID of the agent
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date in YYYY-MM-DD format
   * @param {string} params.endDate - End date in YYYY-MM-DD format
   * @param {string} params.deskId - Optional desk ID filter
   * @returns {Promise} - Promise with agent statistics data
   */
  getAgentStats: async (agentId, params = {}) => {
    const response = await API.get(`/agents/${agentId}/stats`, { params });
    return response.data;
  },

  /**
   * Get detailed agent feedback
   * @param {string} agentId - UUID of the agent
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date in YYYY-MM-DD format
   * @param {string} params.endDate - End date in YYYY-MM-DD format
   * @param {string} params.deskId - Optional desk ID filter
   * @param {number} params.page - Page number for pagination
   * @param {number} params.limit - Items per page for pagination
   * @returns {Promise} - Promise with agent feedback data and pagination
   */
  getAgentFeedback: async (agentId, params = {}) => {
    const response = await API.get(`/agents/${agentId}/feedback`, { params });
    return response.data;
  },

  /**
   * Get desk-specific performance for an agent
   * @param {string} agentId - UUID of the agent
   * @param {string} deskId - UUID of the desk
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date in YYYY-MM-DD format
   * @param {string} params.endDate - End date in YYYY-MM-DD format
   * @returns {Promise} - Promise with desk-specific metrics
   */
  getAgentDeskPerformance: async (agentId, deskId, params = {}) => {
    const response = await API.get(`/agents/${agentId}/desk-performance`, { 
      params: { ...params, deskId } 
    });
    return response.data;
  }
};

export default AgentService;
