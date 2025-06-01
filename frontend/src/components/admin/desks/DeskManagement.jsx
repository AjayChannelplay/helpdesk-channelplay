import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaEnvelope, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
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
    setSubmitLoading(true);
    
    try {
      // Format allowed domains
      const domainsArray = formData.allowed_domains
        ? formData.allowed_domains.split(',').map(domain => domain.trim())
        : [];
      
      const payload = {
        ...formData,
        allowed_domains: domainsArray
      };
      
      const response = await API.post('/desks', payload);
      
      // Add new desk to state
      setDesks([...desks, response.data.desk]);
      setShowModal(false);
      setSuccessMessage('Desk created successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      
    } catch (err) {
      console.error('Error creating desk:', err);
      setError('Failed to create desk. ' + (err.response?.data?.message || 'Please try again.'));
    } finally {
      setSubmitLoading(false);
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
                  <th>Integration</th>
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
                        <Badge bg="success" className="d-flex align-items-center">
                          <FaEnvelope className="me-1" />
                          <span>
                            {desk.email_integration.provider_type === 'MICROSOFT' ? 'Microsoft' : 'Gmail'} 
                            <span className="ms-1 small">Connected</span>
                          </span>
                        </Badge>
                      ) : (
                        <div>
                          <Badge bg="secondary" className="d-flex align-items-center">
                            Not Connected
                          </Badge>
                          <Button 
                            variant="link" 
                            size="sm" 
                            className="p-0 mt-1"
                            onClick={() => window.location.href = `/admin/oauth-setup?desk=${desk.id}&email=${encodeURIComponent(desk.email_address || '')}`}
                          >
                            Configure...
                          </Button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-2">
                        <Button variant="outline-primary" size="sm">
                          <FaEdit />
                        </Button>
                        <Button 
                          variant="outline-danger" 
                          size="sm"
                          onClick={() => handleDeleteDesk(desk.id)}
                        >
                          <FaTrash />
                        </Button>
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
