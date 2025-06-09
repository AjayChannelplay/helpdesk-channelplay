/**
 * Direct implementation of round-robin assignment without relying on the SQL function
 */

const { supabase } = require('../config/db.config');

/**
 * Assigns a user to a message/ticket using round-robin approach
 * This implementation uses direct database queries instead of the SQL function
 * 
 * @param {string} deskId - The ID of the desk to which the message belongs
 * @param {string} microsoftConversationId - The conversation ID to check for existing assignments
 * @returns {Promise<string|null>} - The assigned user ID or null if assignment failed
 */
async function assignUserRoundRobin(deskId, microsoftConversationId) {
  console.log(`[AssignmentUtils] Attempting round-robin for deskId: ${deskId}, conversationId: ${microsoftConversationId}`);
  try {
    // Ensure deskId is provided
    if (!deskId) {
      console.error('[AssignmentUtils] deskId is undefined or null. Cannot perform assignment.');
      return null;
    }
    console.log(`[AssignmentUtils] Starting round-robin assignment for desk: ${deskId}, conversation: ${microsoftConversationId}`);
    
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
        console.log(`[AssignmentUtils] Conversation ${microsoftConversationId} already assigned to ${existingMessage[0].assigned_to_user_id}. Reusing.`);
        return existingMessage[0].assigned_to_user_id;
      } else {
        console.log(`[AssignmentUtils] No existing assignment found for conversation ${microsoftConversationId}, or assigned_to_user_id is null.`);
      }
    }
    
    // STEP 2: If no existing assignment, perform direct round-robin
    
    // Get desk record to check last assigned user
    const { data: deskRecord } = await supabase
      .from('desks')
      .select('id, last_assigned_user_id')
      .eq('id', deskId)
      .single();
      
    console.log(`[AssignmentUtils] Fetched desk record for deskId ${deskId}:`, JSON.stringify(deskRecord));
    if (!deskRecord) {
      console.error(`[AssignmentUtils] Desk record not found for deskId: ${deskId}. Cannot perform assignment.`);
      return null;
    }
    
    // Get all users assigned to this desk
    const { data: deskUsers, error: deskUsersError } = await supabase
      .from('desk_assignments')
      .select('user_id')
      .eq('desk_id', deskId)
      .order('user_id');
      
    if (deskUsersError) {
      console.error(`[AssignmentUtils] Error fetching desk_assignments:`, deskUsersError);
      return null;
    }

    console.log(`[AssignmentUtils] Fetched ${deskUsers?.length || 0} users for desk ${deskId}:`, JSON.stringify(deskUsers));
    
    // Important: Verify these users actually exist in the users table
    // This prevents foreign key constraint errors when updating last_assigned_user_id
    if (deskUsers && deskUsers.length > 0) {
      const userIds = deskUsers.map(u => u.user_id);
      const { data: validUsers, error: validUsersError } = await supabase
        .from('users')
        .select('id')
        .in('id', userIds);
        
      if (validUsersError) {
        console.error(`[AssignmentUtils] Error validating users:`, validUsersError);
        return null;
      }
      
      if (!validUsers || validUsers.length === 0) {
        console.error(`[AssignmentUtils] None of the assigned users exist in the users table!`);
        return null;
      }
      
      // Filter deskUsers to only include users that exist in the users table
      const validUserIds = validUsers.map(u => u.id);
      const validDeskUsers = deskUsers.filter(du => validUserIds.includes(du.user_id));
      
      console.log(`[AssignmentUtils] Found ${validDeskUsers.length} valid users (out of ${deskUsers.length}) for desk ${deskId}`);
      
      // Replace deskUsers with the filtered list
      deskUsers.splice(0, deskUsers.length, ...validDeskUsers);
    }
    
    // If no users are assigned, cannot assign
    if (!deskUsers || deskUsers.length === 0) {
      console.warn(`[AssignmentUtils] No users are assigned to desk ${deskId}. Cannot perform round-robin.`);
      return null;
    }
    
    let nextUserId;
    
    // If no user was previously assigned, start with the first user
    if (!deskRecord.last_assigned_user_id) {
      nextUserId = deskUsers[0].user_id;
      console.log(`[AssignmentUtils] No last_assigned_user_id for desk ${deskId}. Assigning to first user in list: ${nextUserId}`);
    } else {
      // Find the index of the last assigned user
      const currentIdx = deskUsers.findIndex(u => u.user_id === deskRecord.last_assigned_user_id);
      
      // If user not found (could be unassigned since last assignment) or is last in list
      // start with first user, otherwise use next user
      const nextIdx = (currentIdx === -1 || currentIdx >= deskUsers.length - 1) ? 0 : currentIdx + 1;
      nextUserId = deskUsers[nextIdx].user_id;
      
      console.log(`[AssignmentUtils] Desk ${deskId}: Last assigned was ${deskRecord.last_assigned_user_id}. Current index: ${currentIdx}. Next index: ${nextIdx}. Assigning to user: ${nextUserId}`);
    }
    
    // Final verification that the user exists in the users table
    const { data: userCheck, error: userCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('id', nextUserId)
      .single();
      
    if (userCheckError || !userCheck) {
      console.error(`[AssignmentUtils] CRITICAL: Selected user ${nextUserId} does not exist in users table!`); 
      // Try to find any valid user
      const { data: anyUser } = await supabase
        .from('users')
        .select('id')
        .limit(1);
        
      if (anyUser && anyUser.length > 0) {
        console.log(`[AssignmentUtils] Falling back to alternative user: ${anyUser[0].id}`);
        nextUserId = anyUser[0].id;
      } else {
        return null; // No valid users found
      }
    }
    
    // Update the desk record with new last assigned user
    if (nextUserId) {
      const { error: updateError } = await supabase
        .from('desks')
        .update({ last_assigned_user_id: nextUserId })
        .eq('id', deskId);
        
      if (updateError) {
        console.error(`[Assignment] Error updating desk record:`, updateError);
      } else {
        console.log(`[AssignmentUtils] Successfully updated desk ${deskId} with last_assigned_user_id = ${nextUserId}`);
      }
    }
    
    return nextUserId;
  } catch (error) {
    console.error(`[AssignmentUtils] CRITICAL ERROR during round-robin assignment for desk ${deskId}:`, error);
    return null;
  }
}

module.exports = {
  assignUserRoundRobin
};
