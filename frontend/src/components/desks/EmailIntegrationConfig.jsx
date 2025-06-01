import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Alert } from 'react-bootstrap';
import EmailService from '../../services/email.service';
import DeskService from '../../services/desk.service';

const EmailIntegrationConfig = ({ deskId, onUpdate }) => {
  const [desk, setDesk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [provider, setProvider] = useState('MICROSOFT');

  // Fetch desk data
  useEffect(() => {
    const fetchDesk = async () => {
      try {
        setLoading(true);
        const response = await DeskService.getDeskById(deskId);
        setDesk(response.desk);
      } catch (err) {
        setError('Failed to fetch desk information');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (deskId) {
      fetchDesk();
    }
  }, [deskId]);

  // Handle Microsoft OAuth integration
  const handleMicrosoftOAuth = async () => {
    try {
      setLoading(true);
      const response = await EmailService.getMicrosoftAuthUrl(deskId);
      // Redirect user to Microsoft auth page
      window.location.href = response.authUrl;
    } catch (err) {
      setError('Failed to initialize Microsoft authentication');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Gmail OAuth integration
  const handleGmailOAuth = async () => {
    try {
      setLoading(true);
      const response = await EmailService.getGmailAuthUrl(deskId);
      // Redirect user to Gmail auth page
      window.location.href = response.authUrl;
    } catch (err) {
      setError('Failed to initialize Gmail authentication');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle provider change
  const handleProviderChange = (e) => {
    setProvider(e.target.value);
  };

  // Initiate OAuth based on selected provider
  const initiateOAuth = () => {
    if (provider === 'MICROSOFT') {
      handleMicrosoftOAuth();
    } else {
      handleGmailOAuth();
    }
  };

  if (loading && !desk) return <div>Loading desk configuration...</div>;

  return (
    <Card className="mb-4">
      <Card.Header as="h5">Email Integration Configuration</Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <p>Connect this desk to an email provider to send and receive emails directly from the helpdesk.</p>
        
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>Select Email Provider</Form.Label>
            <Form.Select 
              value={provider}
              onChange={handleProviderChange}
            >
              <option value="MICROSOFT">Microsoft (Office 365/Outlook)</option>
              <option value="GMAIL">Gmail</option>
            </Form.Select>
          </Form.Group>

          <div className="d-grid gap-2">
            <Button 
              variant="primary" 
              onClick={initiateOAuth}
              disabled={loading}
            >
              {loading ? 'Connecting...' : 'Connect Email Account'}
            </Button>
          </div>
        </Form>

        {desk?.email_integration && (
          <div className="mt-4">
            <Alert variant="info">
              <strong>Current Integration:</strong>
              <p className="mb-1">Provider: {desk.email_integration.provider_type}</p>
              <p className="mb-1">Email: {desk.email_integration.email_address}</p>
              <p className="mb-0">Connected: {new Date(desk.email_integration.updated_at).toLocaleString()}</p>
            </Alert>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default EmailIntegrationConfig;
