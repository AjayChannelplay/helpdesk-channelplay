/**
 * Script to generate test data for agent dashboard
 * Run with: node scripts/generate-test-data.js
 */

const { supabase } = require('../config/db.config');

async function generateTestData() {
  const agentId = '035f32bb-6bed-4ca9-9b7b-2618f145242a'; // Replace with your agent ID if different
  const deskId = '478f8387-b27d-491d-a566-923f75f8734d'; // Replace with your desk ID if different
  
  try {
    console.log('Generating test messages...');
    
    // Generate outgoing messages for the past 30 days (at least 25)
    const messages = [];
    const today = new Date();
    
    // Ensure we generate at least 25 messages
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      
      // Create 1-4 messages per day with random status to ensure we get at least 25
      const dailyCount = Math.floor(Math.random() * 3) + 2; // At least 2 messages per day
      for (let j = 0; j < dailyCount; j++) {
        const status = Math.random() > 0.4 ? 'closed' : 'open'; // 60% closed, 40% open
        const hourOffset = Math.floor(Math.random() * 8);
        const messageDate = new Date(date);
        messageDate.setHours(9 + hourOffset);
        
        messages.push({
          desk_id: deskId,
          assigned_to_user_id: agentId,
          direction: 'outgoing', // Make sure this matches what the controller expects
          status: status,
          subject: `Test message ${i}-${j}`,
          body_text: `This is a test message ${i}-${j} for agent dashboard testing.`,
          created_at: messageDate.toISOString(),
          from_address: 'system@example.com',
          to_recipients: JSON.stringify([{ email: 'customer' + i + '-' + j + '@example.com' }]),
          microsoft_conversation_id: `test-conversation-${i}-${j}`,
          microsoft_message_id: `test-message-${i}-${j}-${Date.now()}`
        });
      }
    }
    
    console.log(`Generated ${messages.length} test messages.`);
    
    // Insert messages in batches of 20 to avoid potential payload limits
    if (messages.length > 0) {
      for (let i = 0; i < messages.length; i += 20) {
        const batch = messages.slice(i, i + 20);
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .insert(batch);
        
        if (messagesError) {
          console.error(`Error inserting batch ${i/20 + 1}:`, messagesError);
        } else {
          console.log(`Inserted batch ${i/20 + 1} with ${batch.length} messages.`);
        }
      }
      console.log(`Inserted total of ${messages.length} test messages.`);
    }
    
    // Generate feedback entries (at least 25)
    console.log('Generating test feedback...');
    const feedbackEntries = [];
    const ratings = ['positive', 'neutral', 'negative'];
    
    // Ensure we generate at least 25 feedback entries
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(today.getDate() - Math.floor(Math.random() * 30));
      
      // Distribution skewed toward positive/neutral for more realistic data
      let ratingIndex;
      const randomVal = Math.random();
      if (randomVal > 0.7) {
        ratingIndex = 2; // negative (30%)
      } else if (randomVal > 0.3) {
        ratingIndex = 0; // positive (40%)
      } else {
        ratingIndex = 1; // neutral (30%)
      }
      
      feedbackEntries.push({
        agent_id: agentId,
        rating: ratings[ratingIndex],
        customer_email: `customer${i}@example.com`,
        conversation_id: `test-conversation-${i % 15}`, // Link some feedback to the same conversations
        comments: i % 2 === 0 ? `Customer feedback: ${ratings[ratingIndex]} experience with case handling` : null,
        created_at: date.toISOString()
      });
    }
    
    console.log(`Generated ${feedbackEntries.length} test feedback entries.`);
    
    // Insert feedback in batches
    if (feedbackEntries.length > 0) {
      for (let i = 0; i < feedbackEntries.length; i += 20) {
        const batch = feedbackEntries.slice(i, i + 20);
        const { data: feedbackData, error: feedbackError } = await supabase
          .from('feedback')
          .insert(batch);
        
        if (feedbackError) {
          console.error(`Error inserting feedback batch ${i/20 + 1}:`, feedbackError);
        } else {
          console.log(`Inserted feedback batch ${i/20 + 1} with ${batch.length} entries.`);
        }
      }
      console.log(`Inserted total of ${feedbackEntries.length} test feedback entries.`);
    }
    
    console.log('Test data generation complete!');
  } catch (error) {
    console.error('Error generating test data:', error);
  }
}

// Run the data generation
generateTestData().then(() => {
  console.log('Script finished.');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
