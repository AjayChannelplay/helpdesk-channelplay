const db = require('../config/db.config');

const Feedback = {
  /**
   * Create a new feedback entry
   * @param {Object} feedbackData - The feedback data
   * @param {string} feedbackData.ticket_id - The ID of the ticket
   * @param {string} feedbackData.rating - The feedback rating (positive, neutral, negative)
   * @param {string} feedbackData.customer_email - The email of the customer who provided feedback
   * @param {string} [feedbackData.message_id] - The ID of the message that received feedback
   * @param {string} [feedbackData.comments] - Optional comments from the customer
   * @returns {Promise<Object>} The created feedback entry
   */
  create: async (feedbackData) => {
    const { ticket_id, conversation_id, rating, customer_email, message_id, comments } = feedbackData;
    
    // Basic validation
    if (!rating) {
      throw new Error('Missing required field: rating');
    }
    
    // Make sure we have either a ticket ID or a conversation ID
    if (!ticket_id && !conversation_id) {
      throw new Error('Missing required field: either ticket_id or conversation_id is required');
    }
    
    // Insert feedback into database
    const query = `
      INSERT INTO feedback 
        (ticket_id, conversation_id, rating, customer_email, message_id, comments, created_at) 
      VALUES 
        ($1, $2, $3, $4, $5, $6, NOW()) 
      RETURNING *
    `;
    
    try {
      const result = await db.query(query, [ticket_id, conversation_id, rating, customer_email, message_id, comments]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating feedback entry: ${error.message}`);
    }
  },

  /**
   * Get all feedback for a specific ticket
   * @param {string} ticketId - The ID of the ticket
   * @returns {Promise<Array>} The feedback entries for the ticket
   */
  getByTicketId: async (ticketId) => {
    const query = `
      SELECT * FROM feedback
      WHERE ticket_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await db.query(query, [ticketId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting feedback by ticket ID:', error);
      throw new Error(`Failed to get feedback entries: ${error.message}`);
    }
  },

  /**
   * Get feedback statistics by date range
   * @param {string} startDate - ISO string start date
   * @param {string} endDate - ISO string end date
   * @returns {Promise<Object>} The feedback statistics
   */
  getStatsByDateRange: async (startDate, endDate) => {
    const query = `
      SELECT rating, COUNT(*) as count
      FROM feedback
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY rating
    `;
    
    try {
      const result = await db.query(query, [startDate, endDate]);
      
      // Transform results into stats object
      const stats = {
        positive: 0,
        neutral: 0,
        negative: 0,
        total: 0
      };
      
      result.rows.forEach(row => {
        stats[row.rating] = parseInt(row.count);
        stats.total += parseInt(row.count);
      });
      
      return stats;
    } catch (error) {
      console.error('Error getting feedback statistics:', error);
      throw new Error(`Failed to get feedback statistics: ${error.message}`);
    }
  },
  
  /**
   * Get feedback distribution for reporting
   * @returns {Promise<Object>} Feedback distribution data
   */
  getFeedbackDistribution: async () => {
    const query = `
      SELECT 
        rating, 
        COUNT(*) as count,
        DATE_TRUNC('month', timestamp) as month
      FROM feedback
      WHERE timestamp >= NOW() - INTERVAL '6 months'
      GROUP BY rating, month
      ORDER BY month
    `;
    
    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting feedback distribution:', error);
      throw new Error(`Failed to get feedback distribution: ${error.message}`);
    }
  }
};

module.exports = Feedback;
