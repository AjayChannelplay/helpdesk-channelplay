const { supabase } = require('../config/db.config');

/**
 * Agent Controller for statistics and performance metrics
 */
const AgentController = {
  /**
   * Get agent performance statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getAgentStats: async (req, res) => {
    const { agentId } = req.params;
    let { startDate, endDate, deskId } = req.query;
    
    console.log(`[AgentStats] Fetching stats for agent: ${agentId}`);
    console.log(`[AgentStats] Date range: ${startDate} to ${endDate}`);
    if (deskId) {
      console.log(`[AgentStats] Filtering by desk: ${deskId}`);
    }
    
    // Default to last 30 days if no date range provided
    if (!startDate) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDate = thirtyDaysAgo.toISOString().split('T')[0];
    }
    
    if (!endDate) {
      endDate = new Date().toISOString().split('T')[0];
    }
    
    try {
      // First, let's check if we have any messages for this agent at all
      const { data: agentCheck, error: agentCheckError, count: agentMessageCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('assigned_to_user_id', agentId);
        
      if (agentCheckError) {
        console.error('[AgentStats] Error checking agent messages:', agentCheckError);
      } else {
        console.log(`[AgentStats] Agent has ${agentMessageCount || 0} total messages in database`);
      }

      // Query to get all messages by this agent in the date range
      console.log(`[AgentStats] Querying messages between ${startDate}T00:00:00 and ${endDate}T23:59:59`);
      let query = supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('assigned_to_user_id', agentId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
        
      // Filter by desk if provided
      if (deskId) {
        query = query.eq('desk_id', deskId);
      }
      
      const { data: messages, error: messagesError, count } = await query;
      
      if (messagesError) {
        console.error('[AgentStats] Error fetching agent messages:', messagesError);
        return res.status(500).json({ error: 'Failed to fetch agent statistics' });
      }

      console.log(`[AgentStats] Found ${messages.length} messages in date range`);
      
      // Check the structure of a sample message to debug
      if (messages.length > 0) {
        const sampleMessage = messages[0];
        console.log('[AgentStats] Sample message structure:', JSON.stringify({
          id: sampleMessage.id,
          created_at: sampleMessage.created_at,
          status: sampleMessage.status,
          direction: sampleMessage.direction,
          assigned_to_user_id: sampleMessage.assigned_to_user_id,
          desk_id: sampleMessage.desk_id
        }));
      }
      
      // Group messages by date - count ALL messages by this agent
      const messagesByDate = {};
      let outgoingCount = 0;
      let incomingCount = 0;
      
      messages.forEach(msg => {
        // Include all messages by the agent - we'll categorize them below
        const date = msg.created_at.split('T')[0];
        if (!messagesByDate[date]) {
          messagesByDate[date] = { total: 0, closed: 0 };
        }
        
        // Track the directions for debugging
        if (msg.direction === 'outgoing' || msg.direction === 'sent') {
          outgoingCount++;
          messagesByDate[date].total++;
          // Handle potentially different status values
          if (msg.status === 'closed' || msg.status === 'resolved' || msg.status === 'completed') {
            messagesByDate[date].closed++;
          }
        } else if (msg.direction === 'incoming' || msg.direction === 'received') {
          incomingCount++;
        }
      });
      
      console.log(`[AgentStats] Message breakdown: ${outgoingCount} outgoing, ${incomingCount} incoming`);
      console.log(`[AgentStats] Days with activity: ${Object.keys(messagesByDate).length}`);

      
      // Convert to array format for frontend
      const dailyStats = Object.keys(messagesByDate).map(date => ({
        date,
        total: messagesByDate[date].total,
        closed: messagesByDate[date].closed
      }));
      
      // Get feedback stats
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback')
        .select('rating')
        .eq('agent_id', agentId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
        
      if (feedbackError) {
        console.error('Error fetching agent feedback:', feedbackError);
        return res.status(500).json({ error: 'Failed to fetch agent feedback statistics' });
      }
      
      // Calculate feedback distribution
      const feedbackDistribution = {
        positive: 0,
        neutral: 0,
        negative: 0,
        total: feedbackData.length
      };
      
      feedbackData.forEach(feedback => {
        // Ratings are already categorized as 'positive', 'neutral', or 'negative' in the database
        if (feedback.rating === 'positive') {
          feedbackDistribution.positive++;
        } else if (feedback.rating === 'neutral') {
          feedbackDistribution.neutral++;
        } else if (feedback.rating === 'negative') {
          feedbackDistribution.negative++;
        }
      });
      
      // Calculate average satisfaction score
      // Using weighted score: (positive_count * 1 + neutral_count * 0 + negative_count * -1) / total
      const satisfactionScore = feedbackData.length > 0 ? 
        (feedbackDistribution.positive - feedbackDistribution.negative) / feedbackData.length :
        0;
        
      // Get desk stats
      const { data: desksData, error: desksError } = await supabase
        .from('messages')
        .select('desk_id, desks!inner(name)')
        .eq('assigned_to_user_id', agentId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
        
      if (desksError) {
        console.error('Error fetching agent desk data:', desksError);
      }
      
      // Group by desk
      const deskStats = {};
      desksData?.forEach(item => {
        if (!deskStats[item.desk_id]) {
          deskStats[item.desk_id] = {
            desk_id: item.desk_id,
            name: item.desks.name,
            count: 0
          };
        }
        deskStats[item.desk_id].count++;
      });
      
      // Build the response object
      const stats = {
        agentId,
        messageCount: count || 0,
        timeRange: { startDate, endDate },
        dailyStats,
        feedback: {
          distribution: feedbackDistribution,
          satisfactionScore
        },
        desks: Object.values(deskStats)
      };
      
      return res.status(200).json(stats);
    } catch (error) {
      console.error('Error in getAgentStats:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  
  /**
   * Get detailed feedback for an agent
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getAgentFeedback: async (req, res) => {
    const { agentId } = req.params;
    let { startDate, endDate, deskId, page = 1, limit = 10 } = req.query;
    
    // Default to last 30 days if no date range provided
    if (!startDate) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDate = thirtyDaysAgo.toISOString().split('T')[0];
    }
    
    if (!endDate) {
      endDate = new Date().toISOString().split('T')[0];
    }
    
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Query for feedback
      let query = supabase
        .from('feedback')
        .select(`
          *,
          messages!inner(subject, desk_id)
        `, { count: 'exact' })
        .eq('agent_id', agentId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
        
      // Filter by desk if provided (join through messages)
      if (deskId) {
        query = query.eq('messages.desk_id', deskId);
      }
      
      // Add pagination
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error fetching agent feedback:', error);
        return res.status(500).json({ error: 'Failed to fetch agent feedback' });
      }
      
      return res.status(200).json({
        feedback: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      });
    } catch (error) {
      console.error('Error in getAgentFeedback:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  
  /**
   * Get desk-specific performance for an agent
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getAgentDeskPerformance: async (req, res) => {
    const { agentId } = req.params;
    const { deskId } = req.query;
    let { startDate, endDate } = req.query;
    
    // Default to last 30 days if no date range provided
    if (!startDate) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDate = thirtyDaysAgo.toISOString().split('T')[0];
    }
    
    if (!endDate) {
      endDate = new Date().toISOString().split('T')[0];
    }
    
    try {
      // Query for messages handled by desk
      const { data: messages, error: messagesError, count } = await supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('assigned_to_user_id', agentId)
        .eq('desk_id', deskId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
        
      if (messagesError) {
        console.error('Error fetching desk messages:', messagesError);
        return res.status(500).json({ error: 'Failed to fetch desk performance data' });
      }
      
      // Calculate average response time
      let totalResponseTime = 0;
      let messagesWithResponseTime = 0;
      
      messages.forEach(msg => {
        if (msg.created_at && msg.first_response_at) {
          const createdAt = new Date(msg.created_at);
          const respondedAt = new Date(msg.first_response_at);
          const responseTime = (respondedAt - createdAt) / (1000 * 60); // Minutes
          
          if (responseTime > 0) {
            totalResponseTime += responseTime;
            messagesWithResponseTime++;
          }
        }
      });
      
      const avgResponseTime = messagesWithResponseTime > 0 ? 
        totalResponseTime / messagesWithResponseTime : 
        0;
      
      // Get feedback for this desk and agent
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback')
        .select(`
          *,
          messages!inner(desk_id)
        `)
        .eq('agent_id', agentId)
        .eq('messages.desk_id', deskId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);
        
      if (feedbackError) {
        console.error('Error fetching desk feedback:', feedbackError);
        return res.status(500).json({ error: 'Failed to fetch desk feedback data' });
      }
      
      // Calculate feedback distribution
      const feedbackDistribution = {
        positive: 0,
        neutral: 0,
        negative: 0,
        total: feedbackData.length
      };
      
      feedbackData.forEach(feedback => {
        // Ratings are already categorized as 'positive', 'neutral', or 'negative' in the database
        if (feedback.rating === 'positive') {
          feedbackDistribution.positive++;
        } else if (feedback.rating === 'neutral') {
          feedbackDistribution.neutral++;
        } else if (feedback.rating === 'negative') {
          feedbackDistribution.negative++;
        }
      });
      
      return res.status(200).json({
        deskId,
        agentId,
        messageCount: count || 0,
        avgResponseTime,
        feedback: feedbackDistribution
      });
    } catch (error) {
      console.error('Error in getAgentDeskPerformance:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = AgentController;
