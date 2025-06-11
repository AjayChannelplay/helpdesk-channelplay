import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Table, Card, Pagination, Badge, Form, Row, Col } from 'react-bootstrap';
import AgentService from '../../services/agent.service';
import AuthService from '../../services/auth.service';
import DeskService from '../../services/desk.service';

const AgentFeedbackList = () => {
  const { agentId } = useParams();
  const [currentUser, setCurrentUser] = useState(AuthService.getCurrentUser());
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0
  });
  const [dateRange, setDateRange] = useState({
    startDate: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date.toISOString().split('T')[0];
    })(),
    endDate: new Date().toISOString().split('T')[0],
  });
  const [selectedDeskId, setSelectedDeskId] = useState('');
  const [desks, setDesks] = useState([]);

  // Effect to load available desks
  useEffect(() => {
    const fetchDesks = async () => {
      try {
        const desksData = await DeskService.getAllDesks();
        setDesks(desksData || []);
      } catch (err) {
        console.error('Error fetching desks:', err);
      }
    };
    
    fetchDesks();
  }, []);

  // Effect to load feedback data
  useEffect(() => {
    const targetAgentId = agentId || currentUser?.id;
    
    if (!targetAgentId) return;
    
    const fetchFeedback = async () => {
      setLoading(true);
      try {
        const params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          page: pagination.page,
          limit: pagination.limit
        };
        
        if (selectedDeskId) {
          params.deskId = selectedDeskId;
        }
        
        const response = await AgentService.getAgentFeedback(targetAgentId, params);
        setFeedbackList(response.data || []);
        setPagination(prev => ({
          ...prev,
          total: response.total || 0
        }));
        setError(null);
      } catch (err) {
        console.error('Error fetching agent feedback:', err);
        setError('Failed to load feedback data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchFeedback();
  }, [agentId, currentUser, pagination.page, pagination.limit, dateRange, selectedDeskId]);

  // Handle pagination
  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, page }));
  };

  // Handle date range changes
  const handleDateRangeChange = (e, field) => {
    setDateRange(prev => ({
      ...prev,
      [field]: e.target.value
    }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Handle desk selection change
  const handleDeskChange = (e) => {
    setSelectedDeskId(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Format date string
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Render rating badge
  const renderRatingBadge = (rating) => {
    let variant = 'secondary';
    if (rating >= 4) variant = 'success';
    else if (rating >= 3) variant = 'warning';
    else variant = 'danger';
    
    return <Badge bg={variant}>{rating}/5</Badge>;
  };

  // Generate pagination items
  const paginationItems = () => {
    const items = [];
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    
    // Previous button
    items.push(
      <Pagination.Prev 
        key="prev" 
        disabled={pagination.page === 1}
        onClick={() => handlePageChange(pagination.page - 1)}
      />
    );
    
    // First page
    items.push(
      <Pagination.Item 
        key={1} 
        active={pagination.page === 1}
        onClick={() => handlePageChange(1)}
      >
        1
      </Pagination.Item>
    );
    
    // Ellipsis if needed
    if (pagination.page > 3) {
      items.push(<Pagination.Ellipsis key="ellipsis1" />);
    }
    
    // Pages around current
    for (let i = Math.max(2, pagination.page - 1); i <= Math.min(totalPages - 1, pagination.page + 1); i++) {
      items.push(
        <Pagination.Item 
          key={i} 
          active={pagination.page === i}
          onClick={() => handlePageChange(i)}
        >
          {i}
        </Pagination.Item>
      );
    }
    
    // Ellipsis if needed
    if (pagination.page < totalPages - 2) {
      items.push(<Pagination.Ellipsis key="ellipsis2" />);
    }
    
    // Last page
    if (totalPages > 1) {
      items.push(
        <Pagination.Item 
          key={totalPages} 
          active={pagination.page === totalPages}
          onClick={() => handlePageChange(totalPages)}
        >
          {totalPages}
        </Pagination.Item>
      );
    }
    
    // Next button
    items.push(
      <Pagination.Next 
        key="next" 
        disabled={pagination.page === totalPages}
        onClick={() => handlePageChange(pagination.page + 1)}
      />
    );
    
    return items;
  };

  if (loading && feedbackList.length === 0) {
    return (
      <Container className="my-4">
        <h2>Loading feedback data...</h2>
      </Container>
    );
  }

  if (error && feedbackList.length === 0) {
    return (
      <Container className="my-4">
        <h2>Error</h2>
        <p className="text-danger">{error}</p>
      </Container>
    );
  }

  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <h2>Agent Feedback List</h2>
          <p className="text-muted">View all customer feedback</p>
        </Col>
      </Row>

      {/* Filters */}
      <Row className="mb-4">
        <Col md={3}>
          <Form.Group>
            <Form.Label>Start Date</Form.Label>
            <Form.Control
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateRangeChange(e, 'startDate')}
            />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group>
            <Form.Label>End Date</Form.Label>
            <Form.Control
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateRangeChange(e, 'endDate')}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Desk</Form.Label>
            <Form.Control
              as="select"
              value={selectedDeskId}
              onChange={handleDeskChange}
            >
              <option value="">All Desks</option>
              {desks.map(desk => (
                <option key={desk.id} value={desk.id}>
                  {desk.name}
                </option>
              ))}
            </Form.Control>
          </Form.Group>
        </Col>
      </Row>

      <Card className="shadow-sm">
        <Card.Body>
          {feedbackList.length > 0 ? (
            <Table responsive hover>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Ticket ID</th>
                  <th>Rating</th>
                  <th>Comments</th>
                  <th>Desk</th>
                </tr>
              </thead>
              <tbody>
                {feedbackList.map(feedback => (
                  <tr key={feedback.id}>
                    <td>{formatDate(feedback.created_at)}</td>
                    <td>{feedback.customer_email}</td>
                    <td>
                      {feedback.ticket_id ? (
                        <a href={`/tickets/${feedback.ticket_id}`}>{feedback.ticket_id}</a>
                      ) : (
                        <span className="text-muted">N/A</span>
                      )}
                    </td>
                    <td>{renderRatingBadge(feedback.rating)}</td>
                    <td>{feedback.comments || <span className="text-muted">No comments</span>}</td>
                    <td>{feedback.desk?.name || <span className="text-muted">Unknown</span>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-center text-muted my-5">No feedback data available for the selected filters</p>
          )}
          
          {/* Pagination */}
          {feedbackList.length > 0 && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <p className="mb-0">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
              </p>
              <Pagination>
                {paginationItems()}
              </Pagination>
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default AgentFeedbackList;
