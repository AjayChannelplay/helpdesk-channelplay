import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Alert, Row, Col, Spinner, Badge, ListGroup } from 'react-bootstrap';
import { FaMicrosoft, FaKey, FaSync, FaCheckCircle, FaTimesCircle, FaPlus } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import API from '../../../services/api.service';
import './OAuthSetup.css';

const OAuthSetup = () => {
  const [desks, setDesks] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedDesk, setSelectedDesk] = useState('');
  const [configuring, setConfiguring] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: window.location.origin + '/api/auth/microsoft/callback',
    tenantId: 'common',
    email: '',
    createDesk: false,
    newDeskName: ''
  });

  // Check for parameters in URL (both OAuth callback and pre-selected desk)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for OAuth callback parameters
    const success = urlParams.get('success');
    const deskId = urlParams.get('desk');
    const email = urlParams.get('email');
    const newDesk = urlParams.get('newDesk');
    
    // Check for pre-selected desk from desk management
    const preSelectedDeskId = urlParams.get('desk');
    const preSelectedEmail = urlParams.get('email');
    
    // If we have success and email from OAuth callback, and we don't already have a desk created
    if (success === 'true' && email && newDesk !== 'true') {
      // Show a message offering to create a desk with this email
      const deskName = window.prompt(`Authentication successful! Would you like to create a new desk with email ${email}? Please enter a name for the desk:`);
      
      if (deskName) {
        // Create a new desk with the authenticated email
        createNewDeskWithEmail(deskName, email);
      }
      
      // Clear the URL parameters after handling
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // Handle pre-selected desk from desk management
    else if (preSelectedDeskId && !success) {
      setSelectedDesk(preSelectedDeskId);
      if (preSelectedEmail) {
        setFormData(prev => ({
          ...prev,
          email: preSelectedEmail
        }));
      }
    }
  }, []);
  
  // Function to create a new desk with authenticated email
  const createNewDeskWithEmail = async (deskName, email) => {
    try {
      setLoading(true);
      setError(null);
      
      // Create the new desk
      const response = await API.post('/desks', {
        name: deskName,
        email_address: email
      });
      
      if (response.data) {
        setSuccess(`New desk "${deskName}" created successfully with email ${email}!`);
        
        // Refresh the desks list
        const desksResponse = await API.get('/desks');
        setDesks(Array.isArray(desksResponse.data) ? desksResponse.data : []);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error creating new desk:', err);
      setError('Failed to create new desk: ' + (err.response?.data?.message || 'Please try again.'));
      setLoading(false);
    }
  };
  
  // Fetch all desks and existing integrations
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch desks
        const desksResponse = await API.get('/desks');
        const desksData = Array.isArray(desksResponse.data) ? desksResponse.data : [];
        setDesks(desksData);
        
        // Fetch existing email integrations
        if (desksData.length > 0) {
          try {
            const integrationsResponse = await API.get('/email-integrations');
            setIntegrations(integrationsResponse.data);
          } catch (integrationsError) {
            console.error('Error fetching integrations:', integrationsError);
            setIntegrations([]);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load required data. Please try again.');
        setDesks([]);
        setIntegrations([]);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch desk OAuth configuration if a desk is selected
  useEffect(() => {
    if (selectedDesk) {
      const fetchDeskConfig = async () => {
        try {
          setLoading(true);
          setError(null);
          
          // Find if this desk already has an integration
          const existingIntegration = integrations.find(i => i.desk_id === selectedDesk);
          
          if (existingIntegration) {
            // Load existing configuration
            setFormData({
              clientId: existingIntegration.client_id || '',
              clientSecret: existingIntegration.client_secret || '',
              redirectUri: window.location.origin + '/api/auth/microsoft/callback',
              tenantId: existingIntegration.tenant_id || 'common'
            });
          } else {
            // Reset form for new configuration
            setFormData({
              clientId: '',
              clientSecret: '',
              redirectUri: window.location.origin + '/api/auth/microsoft/callback',
              tenantId: 'common'
            });
          }
          
          setLoading(false);
        } catch (err) {
          console.error('Error loading desk configuration:', err);
          setError('Failed to load desk configuration. Please try again.');
          setLoading(false);
        }
      };

      fetchDeskConfig();
    }
  }, [selectedDesk, integrations]);

  const handleDeskChange = (e) => {
    const deskId = e.target.value;
    setSelectedDesk(deskId);
    
    // Check if this desk already has an integration
    if (deskId && integrations && integrations.length > 0) {
      const existingIntegration = integrations.find(integration => integration.desk_id === deskId);
      
      if (existingIntegration) {
        // Pre-fill the form with existing configuration
        setFormData({
          clientId: existingIntegration.client_id || '',
          clientSecret: existingIntegration.client_secret || '',
          redirectUri: formData.redirectUri, // Keep the current redirectUri
          tenantId: existingIntegration.tenant_id || 'common'
        });
      } else {
        // Reset form for new integration
        setFormData({
          clientId: '',
          clientSecret: '',
          redirectUri: window.location.origin + '/api/auth/microsoft/callback',
          tenantId: 'common'
        });
      }
    }
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedDesk) {
      setError('Please select a desk to configure.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setConfiguring(true);
      
      // Save configuration to backend
      await API.post('/email-integrations', {
        deskId: selectedDesk,
        providerType: 'microsoft',
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        redirectUri: formData.redirectUri,
        tenantId: formData.tenantId || 'common'
      });
      
      // Refresh integrations list
      const integrationsResponse = await API.get('/email-integrations');
      setIntegrations(integrationsResponse.data);
      
      setSuccess('Microsoft OAuth configuration saved successfully!');
      
      setConfiguring(false);
      setLoading(false);
    } catch (err) {
      console.error('Error saving configuration:', err);
      setError('Failed to save configuration. ' + (err.response?.data?.message || 'Please try again.'));
      setConfiguring(false);
      setLoading(false);
    }
  };
  
  const handleAuthenticate = async () => {
    if (!selectedDesk) {
      setError('Please select a desk to authenticate.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Build query parameters for authentication
      let params = `deskId=${selectedDesk}`;
      
      // Add email parameter if provided
      if (formData.email) {
        params += `&email=${encodeURIComponent(formData.email)}`;
      }
      
      // Always send desk name parameters
      // This allows creating a new desk with the same name after authentication
      const deskName = formData.createDesk ? formData.newDeskName : '';
      
      // Add create desk parameters
      params += `&createDesk=${formData.createDesk ? 'true' : 'false'}&deskName=${encodeURIComponent(deskName || '')}`;
      
      console.log('Authentication parameters:', params);
      
      // Get Microsoft auth URL from backend
      const response = await API.get(`/email-auth/microsoft/url?${params}`);
      
      if (response.data && response.data.authUrl) {
        // Open Microsoft auth page in the same tab
        window.location.href = response.data.authUrl;
      } else {
        setError('Failed to generate authentication URL. Please check your configuration.');
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error getting auth URL:', err);
      setError('Failed to start authentication. ' + (err.response?.data?.message || 'Please try again.'));
      setLoading(false);
    }
  };
  
  const handleRefreshToken = async (integrationId) => {
    try {
      setLoading(true);
      setError(null);
      
      // Call token refresh endpoint
      await API.post(`/email-auth/microsoft/refresh/${integrationId}`);
      
      // Refresh integrations list
      const integrationsResponse = await API.get('/email-integrations');
      setIntegrations(integrationsResponse.data);
      
      setSuccess('Token refreshed successfully!');
      setLoading(false);
    } catch (err) {
      console.error('Error refreshing token:', err);
      setError('Failed to refresh token. ' + (err.response?.data?.message || 'Please try again.'));
      setLoading(false);
    }
  };

  return (
    <div className="oauth-setup-container">
      <h2 className="mb-4">OAuth2 Setup for Microsoft</h2>
      
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          <FaTimesCircle className="me-2" /> {error}
        </Alert>
      )}
      
      {success && (
        <Alert variant="success" onClose={() => setSuccess(null)} dismissible>
          <FaCheckCircle className="me-2" /> {success}
        </Alert>
      )}
      
      {desks.length === 0 ? (
        <Alert variant="info" className="mb-4">
          <p>No desks found. Please create a desk first.</p>
          <Link to="/admin/desk-management" className="btn btn-primary btn-sm">
            <FaPlus className="me-1" /> Create New Desk
          </Link>
        </Alert>
      ) : (
        <Row>
          <Col md={6}>
            <Card className="mb-4">
              <Card.Header className="d-flex align-items-center">
                <FaMicrosoft className="me-2" size={20} />
                <span>Microsoft OAuth2 Configuration</span>
              </Card.Header>
              <Card.Body>
                <Form onSubmit={handleSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label>Select Desk to Configure</Form.Label>
                    <Form.Select 
                      value={selectedDesk} 
                      onChange={handleDeskChange}
                      disabled={loading || configuring}
                    >
                      <option value="">Choose a desk...</option>
                      {Array.isArray(desks) ? desks.map(desk => (
                        <option key={desk.id} value={desk.id}>
                          {desk.name} ({desk.email_address || 'No email configured'})
                        </option>
                      )) : <option disabled>No desks available</option>}
                    </Form.Select>
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label>Client ID</Form.Label>
                    <Form.Control 
                      type="text" 
                      name="clientId" 
                      value={formData.clientId} 
                      onChange={handleInputChange}
                      placeholder="Enter Microsoft Application Client ID"
                      disabled={loading || configuring}
                    />
                    <Form.Text className="text-muted">
                      From your Microsoft Azure App Registration
                    </Form.Text>
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label>Client Secret</Form.Label>
                    <Form.Control 
                      type="password" 
                      name="clientSecret" 
                      value={formData.clientSecret} 
                      onChange={handleInputChange}
                      placeholder="Enter Microsoft Application Client Secret"
                      disabled={loading || configuring}
                    />
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label>Redirect URI</Form.Label>
                    <Form.Control 
                      type="text" 
                      name="redirectUri" 
                      value={formData.redirectUri} 
                      onChange={handleInputChange}
                      placeholder="http://localhost:3001/api/auth/microsoft/callback"
                      disabled={true} // This should not be editable to avoid errors
                    />
                    <Form.Text className="text-muted">
                      Add this URL to your Microsoft Azure App Registration
                    </Form.Text>
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant ID (Optional)</Form.Label>
                    <Form.Control 
                      type="text" 
                      name="tenantId" 
                      value={formData.tenantId} 
                      onChange={handleInputChange}
                      placeholder="common"
                    />
                    <Form.Text className="text-muted">
                      Use 'common' for multi-tenant or your specific tenant ID
                    </Form.Text>
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label>Email Address for Authentication</Form.Label>
                    <Form.Control 
                      type="email" 
                      name="email" 
                      value={formData.email} 
                      onChange={handleInputChange}
                      placeholder="Enter email to pre-fill in Microsoft login"
                    />
                    <Form.Text className="text-muted">
                      This email will be pre-filled in the Microsoft login page
                    </Form.Text>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Check
                      type="checkbox"
                      id="createDeskCheck"
                      name="createDesk"
                      label="Create a new desk after authentication"
                      checked={formData.createDesk}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          createDesk: e.target.checked
                        });
                      }}
                    />
                  </Form.Group>

                  {formData.createDesk && (
                    <Form.Group className="mb-3">
                      <Form.Label>New Desk Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="newDeskName"
                        value={formData.newDeskName}
                        onChange={handleInputChange}
                        placeholder="Enter name for the new desk"
                        required
                      />
                    </Form.Group>
                  )}
                  
                  <div className="d-flex gap-2 mt-4">
                    <Button 
                      variant="primary" 
                      type="submit" 
                      disabled={configuring || !selectedDesk || !formData.clientId || !formData.clientSecret || integrations?.some(integration => integration.desk_id === selectedDesk)} 
                      className="w-100"
                    >
                      {configuring ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Saving...
                        </>
                      ) : (
                        integrations?.some(integration => integration.desk_id === selectedDesk) ?
                        'Update Configuration' : 'Save Configuration'
                      )}
                    </Button>
                    
                    <Button 
                      variant="success" 
                      onClick={handleAuthenticate}
                      disabled={loading || configuring || !selectedDesk || !formData.clientId || !formData.clientSecret}
                    >
                      <FaMicrosoft className="me-2" />
                      Authenticate with Microsoft
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={6}>
            <Card>
              <Card.Header>
                <h5 className="mb-0">Configured OAuth2 Integrations</h5>
              </Card.Header>
              <Card.Body>
                {loading ? (
                  <div className="text-center py-3">
                    <Spinner animation="border" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </Spinner>
                  </div>
                ) : integrations.length === 0 ? (
                  <div className="text-center py-3">
                    <p className="text-muted mb-0">No integrations configured yet.</p>
                  </div>
                ) : (
                  <ListGroup>
                    {integrations.map(integration => {
                      // Find the desk this integration belongs to
                      const desk = desks.find(d => d.id === integration.desk_id);
                      const isExpired = new Date(integration.token_expires_at) < new Date();
                      
                      return (
                        <ListGroup.Item key={integration.id} className="d-flex justify-content-between align-items-center">
                          <div>
                            <div className="d-flex align-items-center">
                              <FaMicrosoft className="me-2 text-primary" />
                              <strong>{desk?.name || 'Unknown Desk'}</strong>
                            </div>
                            <div className="text-muted small mt-1">
                              {integration.email_address || 'No email address'}
                            </div>
                            <div className="mt-2">
                              <Badge bg={isExpired ? 'danger' : 'success'} className="me-2">
                                {isExpired ? 'Token Expired' : 'Active'}
                              </Badge>
                              <small className="text-muted">
                                {isExpired ? 'Needs refresh' : `Expires: ${new Date(integration.token_expires_at).toLocaleString()}`}
                              </small>
                            </div>
                          </div>
                          <Button 
                            variant="outline-primary" 
                            size="sm"
                            onClick={() => handleRefreshToken(integration.id)}
                            disabled={loading}
                          >
                            <FaSync className="me-1" />
                            Refresh Token
                          </Button>
                        </ListGroup.Item>
                      );
                    })}
                  </ListGroup>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default OAuthSetup;
