import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, ListGroup, Spinner, Alert, Badge } from 'react-bootstrap';
import AuthService from '../../services/auth.service';
import AdminService from '../../services/admin.service'; // For admins to get all desks
import DeskService from '../../services/desk.service'; // For agents to get details if needed, or general desk info
import './DesksPage.css'; // We'll create this CSS file next

const DesksPage = () => {
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentUser = AuthService.getCurrentUser();

  const fetchDesks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!currentUser) {
        setError('User not authenticated.');
        setDesks([]);
        setLoading(false);
        return;
      }

      if (currentUser.role === 'admin') {
        const allDesks = await AdminService.getAllDesks(); // Admin sees all desks
        setDesks(allDesks || []);
      } else if (currentUser.role === 'agent') {
        // Agents see only their assigned desks. 
        // The assignedDesks array (containing desk objects) is already in currentUser from login.
        setDesks(currentUser.assignedDesks || []);
      } else {
        setError('User role not recognized.');
        setDesks([]);
      }
    } catch (err) {
      setError('Failed to fetch desks. ' + (err.message || ''));
      setDesks([]);
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    fetchDesks();
  }, [fetchDesks]);

  if (loading) {
    return <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}><Spinner animation="border" /> Loading Desks...</div>;
  }

  return (
    <div className="desks-page-container p-4">
      <Card className="shadow-sm">
        <Card.Header as="h2">
          {currentUser?.role === 'admin' ? 'All Desks' : 'Your Assigned Desks'}
        </Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {desks.length === 0 && !error && (
            <Alert variant="info">
              {currentUser?.role === 'admin' ? 'No desks found. You can create desks in Desk Management.' : 'You are not assigned to any desks yet.'}
            </Alert>
          )}
          {desks.length > 0 && (
            <ListGroup variant="flush">
              {desks.map(desk => (
                <ListGroup.Item key={desk.id} action as={Link} to={`/desks/${desk.id}/tickets`} className="d-flex justify-content-between align-items-start">
                  <div className="ms-2 me-auto">
                    <div className="fw-bold">{desk.name}</div>
                    {desk.description || 'No description available.'}
                  </div>
                  {/* Optionally show number of tickets or status, if available */}
                  {/* <Badge bg="primary" pill> {desk.ticketCount || 0} tickets </Badge> */}
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default DesksPage;
