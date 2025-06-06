import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Spinner, Alert, Modal, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaEnvelope, FaExclamationTriangle, FaCheckCircle, FaSync } from 'react-icons/fa';
import API from '../../../services/api.service';
import './DeskManagement.css';

const DeskManagement = () => {
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    email_address: '',
    allowed_domains: ''
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Fetch all desks on component mount
  useEffect(() => {
    fetchDesks();
  }, []);

  const fetchDesks = async () => {
    try {
      setLoading(true);
      const response = await API.get('/desks');
      setDesks(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching desks:', err);
      setError('Failed to load desks. Please try again.');
      setDesks([]);
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setFormData({
      name: '',
      description: '',
      email_address: '',
      allowed_domains: ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
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
    try {
      setSubmitLoading(true);
      setError(null);
      
      // Convert allowed_domains from comma-separated string to array
      const domainsArray = formData.allowed_domains ? 
        formData.allowed_domains.split(',').map(domain => domain.trim()) :
        [];
      
      const payload = {
        ...formData,
        allowed_domains: domainsArray
      };
      
      const response = await API.post('/desks', payload);
      
      // Add new desk to state
      setDesks([...desks, response.data.desk]);
      setShowModal(false);

      // If OAuth setup was successful and we have an auth URL
      if (response.data.oauthSetup && response.data.authUrl) {
        // Immediately redirect to Microsoft authentication
        window.location.href = response.data.authUrl;
      } else {
        // Regular success message
        setSuccessMessage('Desk created successfully!' + 
          (response.data.message ? ' ' + response.data.message : ''));
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
      }
    } catch (err) {
      console.error('Error creating desk:', err);
      setError('Failed to create desk. ' + (err.response?.data?.message || 'Please try again.'));
    } finally {
      setSubmitLoading(false);
    }
  };

  // Function to handle Microsoft authentication
  const handleMicrosoftAuth = async (deskId, emailHint) => {
    try {
      setLoading(true);
      setError(null);
      
      // Make a direct API call to get the Microsoft auth URL
      const response = await API.get(`/email-auth/microsoft/url`, {
        params: {
          deskId: deskId,
          email: emailHint || ''
        }
      });
      
      // If successful, redirect to the Microsoft auth URL
      if (response.data && response.data.authUrl) {
        console.log('Redirecting to Microsoft auth URL:', response.data.authUrl);
        window.location.href = response.data.authUrl;
      } else {
        setError('Failed to generate Microsoft authentication URL');
      }
    } catch (err) {
      console.error('Failed to get Microsoft auth URL:', err);
      setError('Failed to initiate Microsoft authentication. ' + (err.response?.data?.message || 'Please try again.'));
      setLoading(false);
    }
  };

  // Function to refresh Microsoft OAuth token
  const handleRefreshToken = async (deskId) => {
    try {
      setLoading(true);
      setError(null);
      
      // Call backend to refresh the token
      const response = await API.post(`/email-auth/microsoft/refresh-token/${deskId}`);
      
      if (response.data.success) {
        setSuccessMessage('OAuth token refreshed successfully!');
        
        // Refresh desks to show updated token status
        await fetchDesks();
      } else {
        setError('Failed to refresh token: ' + (response.data.message || 'Unknown error'));
      }
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Error refreshing OAuth token:', err);
      setError('Failed to refresh token. ' + (err.response?.data?.message || 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDesk = async (id) => {
    if (window.confirm('Are you sure you want to delete this desk? This action cannot be undone.')) {
      try {
        await API.delete(`/desks/${id}`);
        // Remove desk from state
        setDesks(desks.filter(desk => desk.id !== id));
        setSuccessMessage('Desk deleted successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
      } catch (err) {
        console.error('Error deleting desk:', err);
        setError('Failed to delete desk. ' + (err.response?.data?.message || 'Please try again.'));
      }
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <div className="desk-management-container">
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Desk Management</h5>
          <Button variant="primary" size="sm" onClick={handleOpenModal}>
            <FaPlus className="me-1" /> Create New Desk
          </Button>
        </Card.Header>
        <Card.Body>
          {error && (
            <Alert variant="danger" onClose={() => setError(null)} dismissible>
              <FaExclamationTriangle className="me-2" /> {error}
            </Alert>
          )}
          
          {successMessage && (
            <Alert variant="success" onClose={() => setSuccessMessage(null)} dismissible>
              <FaCheckCircle className="me-2" /> {successMessage}
            </Alert>
          )}
          
          {desks.length === 0 ? (
            <div className="text-center py-4">
              <p className="mb-3">No desks found. Create your first support desk to get started.</p>
              <Button variant="primary" onClick={handleOpenModal}>
                <FaPlus className="me-1" /> Create New Desk
              </Button>
            </div>
          ) : (
            <Table responsive hover>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Email</th>
                  <th>OAuth Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {desks.map(desk => (
                  <tr key={desk.id}>
                    <td>{desk.name}</td>
                    <td>{desk.description || '-'}</td>
                    <td>{desk.email_address || '-'}</td>
                    <td>
                      {desk.email_integration ? (
                        <div className="d-flex align-items-center">
                          <div className="oauth-status-pill authenticated">
                            <FaCheckCircle className="me-2" />
                            <div>
                              <div className="fw-semibold">{desk.email_integration.provider_type === 'MICROSOFT' ? 'Microsoft' : 'Gmail'} Connected</div>
                              <small className="text-success">Authenticated</small>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center">
                          <div className="oauth-status-pill not-authenticated">
                            <FaExclamationTriangle className="me-2" />
                            <div>
                              <div className="fw-semibold">Not Connected</div>
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="p-0 configure-now-link"
                                onClick={() => handleMicrosoftAuth(desk.id, desk.email_address)}
                              >
                                Configure Now
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-2">
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip>{desk.email_integration ? 'Refresh OAuth Token' : 'Authentication Required'}</Tooltip>}
                        >
                          <Button 
                            variant="outline-info" 
                            size="sm"
                            onClick={desk.email_integration ? () => handleRefreshToken(desk.id) : undefined}
                            disabled={!desk.email_integration}
                          >
                            <FaSync />
                          </Button>
                        </OverlayTrigger>
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip>Edit Desk</Tooltip>}
                        >
                          <Button 
                            variant="outline-primary" 
                            size="sm"
                          >
                            <FaEdit />
                          </Button>
                        </OverlayTrigger>
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip>Delete Desk</Tooltip>}
                        >
                          <Button 
                            variant="outline-danger" 
                            size="sm"
                            onClick={() => handleDeleteDesk(desk.id)}
                          >
                            <FaTrash />
                          </Button>
                        </OverlayTrigger>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
      
      {/* Create Desk Modal */}
      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>Create New Support Desk</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Desk Name *</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g. Support Team"
                required
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Email Address</Form.Label>
              <Form.Control
                type="email"
                name="email_address"
                value={formData.email_address}
                onChange={handleInputChange}
                placeholder="e.g. support@yourcompany.com"
              />
              <Form.Text className="text-muted">
                You can set up email integration after creating the desk.
              </Form.Text>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Allowed Domains</Form.Label>
              <Form.Control
                type="text"
                name="allowed_domains"
                value={formData.allowed_domains}
                onChange={handleInputChange}
                placeholder="e.g. example.com, another.com"
              />
              <Form.Text className="text-muted">
                Comma-separated list of domains that can submit tickets to this desk
              </Form.Text>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Describe the purpose of this desk"
              />
            </Form.Group>
            
            <div className="d-flex justify-content-end gap-2 mt-4">
              <Button variant="secondary" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                type="submit"
                disabled={submitLoading}
              >
                {submitLoading ? (
                  <>
                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                    <span className="ms-2">Creating...</span>
                  </>
                ) : 'Create Desk'}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default DeskManagement;
