import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Button, Form, Card, Container, Row, Col, Alert } from 'react-bootstrap';

// Simple component to test Supabase Realtime functionality
export default function SupabaseTest() {
  const [status, setStatus] = useState('Not connected');
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [testMessage, setTestMessage] = useState('');
  const [deskId, setDeskId] = useState('');
  const [ticketId, setTicketId] = useState('');

  // Clean up function
  const cleanupChannel = () => {
    if (channel) {
      console.log('Removing channel:', channel.topic);
      supabase.removeChannel(channel);
      setChannel(null);
      setStatus('Disconnected');
    }
  };

  // Test basic connection
  const testConnection = async () => {
    // Clean up any existing channel
    cleanupChannel();

    try {
      console.log('Testing basic Supabase connection...');
      const testChannel = supabase.channel('test-basic-connection');
      
      setChannel(testChannel);
      
      testChannel.subscribe((status) => {
        console.log('Basic connection status:', status);
        setStatus(status);
        
        if (status === 'SUBSCRIBED') {
          addMessage('✅ Successfully connected to Supabase Realtime!');
        }
      });
    } catch (error) {
      console.error('Connection test error:', error);
      setStatus('Error: ' + error.message);
      addMessage('❌ Connection Error: ' + error.message);
    }
  };

  // Test message table subscription
  const testMessageSubscription = async () => {
    if (!deskId) {
      addMessage('❌ Error: Please enter a desk ID');
      return;
    }

    // Clean up any existing channel
    cleanupChannel();

    try {
      const channelName = `test_messages_${deskId.replace(/-/g, '_')}`;
      console.log(`Creating test channel for desk ${deskId}:`, channelName);
      
      const testChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `desk_id=eq.${deskId}`,
          },
          (payload) => {
            console.log('Message change detected:', payload);
            addMessage(`📨 Received ${payload.eventType} event: ${JSON.stringify(payload.new || {}).substring(0, 100)}...`);
          }
        )
        .subscribe((status) => {
          console.log(`Message subscription status for desk ${deskId}:`, status);
          setStatus(status);
          
          if (status === 'SUBSCRIBED') {
            addMessage(`✅ Successfully subscribed to messages for desk: ${deskId}`);
          }
        });
        
      setChannel(testChannel);
    } catch (error) {
      console.error('Message subscription error:', error);
      setStatus('Error: ' + error.message);
      addMessage('❌ Subscription Error: ' + error.message);
    }
  };

  // Test ticket subscription
  const testTicketSubscription = async () => {
    if (!ticketId) {
      addMessage('❌ Error: Please enter a ticket ID or conversation ID');
      return;
    }

    // Clean up any existing channel
    cleanupChannel();

    try {
      const channelName = `test_ticket_${ticketId.replace(/-/g, '_')}`;
      console.log(`Creating test channel for conversation ${ticketId}:`, channelName);
      
      // Determine if we're using a UUID (for ticket_id) or a string (for microsoft_conversation_id)
      // UUIDs are typically formatted as: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId);
      const filterField = isUuid ? 'ticket_id' : 'microsoft_conversation_id';
      
      console.log(`Using filter field: ${filterField} with value: ${ticketId}`);
      addMessage(`ℹ️ Using ${filterField} for subscription with value: ${ticketId}`);
      
      const testChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `${filterField}=eq.${ticketId}`,
          },
          (payload) => {
            console.log('Conversation message change detected:', payload);
            addMessage(`💬 Received ${payload.eventType} event for conversation: ${JSON.stringify(payload.new || {}).substring(0, 100)}...`);
          }
        )
        .subscribe((status) => {
          console.log(`Conversation subscription status for ${ticketId}:`, status);
          setStatus(status);
          
          if (status === 'SUBSCRIBED') {
            addMessage(`✅ Successfully subscribed to conversation: ${ticketId}`);
          }
        });
        
      setChannel(testChannel);
    } catch (error) {
      console.error('Conversation subscription error:', error);
      setStatus('Error: ' + error.message);
      addMessage('❌ Conversation Subscription Error: ' + error.message);
    }
  };

  // Insert a test message directly
  const insertTestMessage = async () => {
    if (!deskId) {
      addMessage('❌ Error: Please enter a desk ID');
      return;
    }

    try {
      addMessage('📤 Inserting test message...');
      
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            desk_id: deskId,
            ticket_id: ticketId || null,
            direction: 'outgoing',
            from_address: 'test@example.com',
            from_name: 'Supabase Test',
            to_address: 'recipient@example.com',
            subject: 'Test Message via Supabase Realtime',
            body_text: testMessage || 'This is a test message from the Supabase Test component',
            body_html: `<p>${testMessage || 'This is a test message from the Supabase Test component'}</p>`,
            received_at: new Date().toISOString()
          }
        ])
        .select();
      
      if (error) throw error;
      
      addMessage(`✅ Test message inserted successfully: ID ${data[0]?.id || 'unknown'}`);
    } catch (error) {
      console.error('Insert test message error:', error);
      addMessage('❌ Insert Error: ' + error.message);
    }
  };

  // Helper to add a message to the log
  const addMessage = (message) => {
    setMessages((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupChannel();
    };
  }, []);

  return (
    <Card className="mb-4">
      <Card.Header>
        <h5>Supabase Realtime Test Panel</h5>
      </Card.Header>
      <Card.Body>
        <Alert variant={status === 'SUBSCRIBED' ? 'success' : 'info'} className="mb-3">
          Connection Status: <strong>{status}</strong>
        </Alert>
        
        <div className="mb-3">
          <Button variant="primary" onClick={testConnection} className="me-2">
            Test Basic Connection
          </Button>
        </div>
        
        <Row className="mb-3">
          <Col sm={8}>
            <Form.Group>
              <Form.Label>Desk ID</Form.Label>
              <Form.Control 
                type="text"
                value={deskId}
                onChange={(e) => setDeskId(e.target.value)}
              />
            </Form.Group>
          </Col>
          <Col sm={4} className="d-flex align-items-end">
            <Button 
              variant="primary" 
              onClick={testMessageSubscription}
              disabled={!deskId}
              className="w-100"
            >
              Subscribe to Messages
            </Button>
          </Col>
        </Row>
        
        <Row className="mb-3">
          <Col sm={8}>
            <Form.Group>
              <Form.Label>Ticket ID</Form.Label>
              <Form.Control 
                type="text"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
              />
            </Form.Group>
          </Col>
          <Col sm={4} className="d-flex align-items-end">
            <Button 
              variant="primary" 
              onClick={testTicketSubscription}
              disabled={!ticketId}
              className="w-100"
            >
              Subscribe to Ticket
            </Button>
          </Col>
        </Row>
        
        <Row className="mb-4">
          <Col sm={8}>
            <Form.Group>
              <Form.Label>Test Message</Form.Label>
              <Form.Control 
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
              />
            </Form.Group>
          </Col>
          <Col sm={4} className="d-flex align-items-end">
            <Button 
              variant="success" 
              onClick={insertTestMessage}
              disabled={!deskId}
              className="w-100"
            >
              Insert Test Message
            </Button>
          </Col>
        </Row>
        
        <h6>Event Log:</h6>
        
        <Card className="bg-light">
          <Card.Body>
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {messages.length === 0 ? (
                <p className="text-muted">No events yet. Start a test to see results here.</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="mb-1" style={{ fontFamily: 'monospace' }}>
                    {msg}
                  </div>
                ))
              )}
            </div>
          </Card.Body>
        </Card>
      </Card.Body>
    </Card>
  );
}
