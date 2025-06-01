import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Tabs, Tab, Alert } from 'react-bootstrap';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DeskService from '../../services/desk.service';
import EmailIntegrationConfig from './EmailIntegrationConfig';
import UserService from '../../services/user.service';

const DeskDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  
  const [desk, setDesk] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  // Check for integration success message in URL
  useEffect(() => {
    if (queryParams.get('integration') === 'success') {
      setSuccess('Email integration connected successfully!');
    }
  }, [queryParams]);

  // Fetch desk data
  useEffect(() => {
    const fetchDesk = async () => {
      try {
        setLoading(true);
        const response = await DeskService.getDeskById(id);
        setDesk(response.desk);
      } catch (err) {
        setError('Failed to fetch desk information');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    // Fetch all users for agent assignment
    const fetchUsers = async () => {
      try {
        const response = await UserService.getAllUsers();
        setUsers(response.users);
      } catch (err) {
        console.error('Failed to fetch users', err);
      }
    };

    if (id) {
      fetchDesk();
      fetchUsers();
    }
  }, [id]);

  // Handle delete desk
  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this desk?')) {
      try {
        await DeskService.deleteDesk(id);
        navigate('/desks');
      } catch (err) {
        setError('Failed to delete desk');
        console.error(err);
      }
    }
  };

  // Refresh desk data after integration update
  const handleIntegrationUpdate = async () => {
    try {
      const response = await DeskService.getDeskById(id);
      setDesk(response.desk);
      setSuccess('Desk information updated successfully');
    } catch (err) {
      setError('Failed to refresh desk information');
      console.error(err);
    }
  };

  if (loading && !desk) return <Container className="py-4"><div>Loading desk details...</div></Container>;

  return (
    <Container className="py-4">
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>{desk?.name}</h2>
        <div>
          <Button variant="outline-primary" className="me-2" onClick={() => navigate(`/desks/${id}/edit`)}>
            Edit Desk
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Desk
          </Button>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-3"
      >
        <Tab eventKey="details" title="Details">
          <Card>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <h5>Desk Information</h5>
                  <p><strong>Name:</strong> {desk?.name}</p>
                  <p><strong>Description:</strong> {desk?.description}</p>
                  <p><strong>Email Address:</strong> {desk?.email_address}</p>
                  <p><strong>Provider Type:</strong> {desk?.provider_type || 'Not set'}</p>
                  <p><strong>Created:</strong> {new Date(desk?.created_at).toLocaleString()}</p>
                </Col>
                <Col md={6}>
                  <h5>Assigned Agents</h5>
                  {desk?.agents?.length > 0 ? (
                    <ul className="list-group">
                      {desk.agents.map(agent => (
                        <li key={agent.id} className="list-group-item">
                          {agent.username} ({agent.email})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No agents assigned to this desk yet.</p>
                  )}
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Tab>
        
        <Tab eventKey="email" title="Email Integration">
          <EmailIntegrationConfig 
            deskId={id} 
            onUpdate={handleIntegrationUpdate} 
          />
        </Tab>
        
        <Tab eventKey="agents" title="Agent Assignment">
          <Card>
            <Card.Body>
              <h5>Assign Agents to Desk</h5>
              {/* Agent assignment form would go here */}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>
    </Container>
  );
};

export default DeskDetails;
