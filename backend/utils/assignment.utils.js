/**
 * Utility functions for ticket assignment logic
 */

const { supabase } = require('../config/db.config');

/**
 * Assigns a user to a message/ticket using round-robin approach
 * 
 * @param {string} deskId - The ID of the desk to which the message belongs
 * @param {string} microsoftConversationId - The conversation ID to check for existing assignments
 * @returns {Promise<string|null>} - The assigned user ID or null if assignment failed
 */
async function assignUserRoundRobin(deskId, microsoftConversationId) {
  try {
    console.log(`[Assignment] Starting round-robin assignment for conversation: ${microsoftConversationId}`);
    
    // STEP 1: Check if this is part of an existing conversation
    if (microsoftConversationId) {
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('assigned_to_user_id')
        .eq('microsoft_conversation_id', microsoftConversationId)
        .not('assigned_to_user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
      
      // If found, use the same assignment
      if (existingMessage && existingMessage.length > 0 && existingMessage[0].assigned_to_user_id) {
        console.log(`[Assignment] Found existing assignment: ${existingMessage[0].assigned_to_user_id}`);
        return existingMessage[0].assigned_to_user_id;
      }
    }
    
    // STEP 2: If no existing assignment, perform round-robin
    return await supabase.rpc('assign_user_round_robin', { desk_id_param: deskId });
  } catch (error) {
    console.error('[Assignment] Error in round-robin assignment:', error);
    return null;
  }
}

module.exports = {
  assignUserRoundRobin
};
