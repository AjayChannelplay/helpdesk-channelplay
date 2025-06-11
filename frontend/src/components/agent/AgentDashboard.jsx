import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Row, Col, Card, Form } from 'react-bootstrap';
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import AgentService from '../../services/agent.service';
import DeskService from '../../services/desk.service';
import AuthService from '../../services/auth.service';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const AgentDashboard = () => {
  const { agentId } = useParams();
  const [currentUser, setCurrentUser] = useState(AuthService.getCurrentUser());
  const [stats, setStats] = useState(null);
  const [desks, setDesks] = useState([]);
  const [selectedDeskId, setSelectedDeskId] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date.toISOString().split('T')[0];
    })(),
    endDate: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Effect to load stats when filters change
  useEffect(() => {
    const targetAgentId = agentId || currentUser?.id;
    
    if (!targetAgentId) return;
    
    const fetchStats = async () => {
      setLoading(true);
      try {
        const params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        };
        
        if (selectedDeskId) {
          params.deskId = selectedDeskId;
        }
        
        const statsData = await AgentService.getAgentStats(targetAgentId, params);
        setStats(statsData);
        setError(null);
      } catch (err) {
        console.error('Error fetching agent stats:', err);
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, [agentId, currentUser, dateRange, selectedDeskId]);

  // Handle date range changes
  const handleDateRangeChange = (e, field) => {
    setDateRange(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  // Handle desk selection change
  const handleDeskChange = (e) => {
    setSelectedDeskId(e.target.value);
  };

  // Prepare chart data for resolution timeline
  const resolutionChartData = {
    labels: stats?.dailyStats?.map(item => item.date) || [],
    datasets: [
      {
        label: 'Tickets Handled',
        data: stats?.dailyStats?.map(item => item.total) || [],
        borderColor: '#2196f3',
        backgroundColor: 'rgba(33, 150, 243, 0.2)',
        borderWidth: 2,
        tension: 0.3,
      },
      {
        label: 'Tickets Closed',
        data: stats?.dailyStats?.map(item => item.closed) || [],
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        borderWidth: 2,
        tension: 0.3,
      }
    ]
  };

  // Prepare chart data for feedback distribution
  const feedbackChartData = {
    labels: ['Positive', 'Neutral', 'Negative'],
    datasets: [
      {
        data: [
          stats?.feedback?.distribution?.positive || 0,
          stats?.feedback?.distribution?.neutral || 0,
          stats?.feedback?.distribution?.negative || 0
        ],
        backgroundColor: ['#4caf50', '#ff9800', '#f44336'],
        borderWidth: 1,
      }
    ]
  };

  // Prepare chart data for desk distribution
  const deskChartData = {
    labels: stats?.desks?.map(desk => desk.name) || [],
    datasets: [
      {
        label: 'Tickets by Desk',
        data: stats?.desks?.map(desk => desk.count) || [],
        backgroundColor: 'rgba(103, 58, 183, 0.5)',
        borderColor: '#673ab7',
        borderWidth: 1,
      }
    ]
  };

  if (loading && !stats) {
    return (
      <Container className="my-4">
        <h2>Loading agent performance data...</h2>
      </Container>
    );
  }

  if (error && !stats) {
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
          <h2>Agent Performance Dashboard</h2>
          {currentUser && (
            <h5 className="text-muted">
              {currentUser.first_name || currentUser.username} {currentUser.last_name || ''}
            </h5>
          )}
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
      
      {/* Stats Overview */}
      <Row className="mb-4">
        <Col md={4}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <Card.Title>Total Messages</Card.Title>
              <h3 className="mt-3">{stats?.messageCount || 0}</h3>
              <Card.Text className="text-muted">
                {dateRange.startDate} to {dateRange.endDate}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <Card.Title>Customer Satisfaction</Card.Title>
              <h3 className="mt-3">
                {stats?.feedback?.satisfactionScore ? 
                  `${(stats.feedback.satisfactionScore * 100).toFixed(1)}%` : 
                  'N/A'}
              </h3>
              <Card.Text className="text-muted">
                Based on {stats?.feedback?.distribution?.total || 0} ratings
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <Card.Title>Active Desks</Card.Title>
              <h3 className="mt-3">{stats?.desks?.length || 0}</h3>
              <Card.Text className="text-muted">
                Desks with assigned conversations
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      {/* Charts */}
      <Row className="mb-4">
        <Col md={8}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <Card.Title>Resolution Timeline</Card.Title>
              <div className="chart-container" style={{ height: '300px' }}>
                {stats?.dailyStats?.length > 0 ? (
                  <Line 
                    data={resolutionChartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Number of Tickets'
                          }
                        }
                      }
                    }} 
                  />
                ) : (
                  <p className="text-center text-muted mt-5">No data available for this time period</p>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="shadow-sm h-100">
            <Card.Body>
              <Card.Title>Customer Feedback</Card.Title>
              <div className="chart-container" style={{ height: '300px' }}>
                {(stats?.feedback?.distribution?.total > 0) ? (
                  <Pie 
                    data={feedbackChartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom'
                        }
                      }
                    }} 
                  />
                ) : (
                  <p className="text-center text-muted mt-5">No feedback data available</p>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      {/* Desk Performance */}
      <Row>
        <Col>
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title>Performance by Desk</Card.Title>
              <div className="chart-container" style={{ height: '300px' }}>
                {stats?.desks?.length > 0 ? (
                  <Bar 
                    data={deskChartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Number of Tickets'
                          }
                        }
                      }
                    }} 
                  />
                ) : (
                  <p className="text-center text-muted mt-5">No desk data available</p>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AgentDashboard;
