import React, { useState, useEffect, useCallback } from 'react';
import AdminService from '../../../services/admin.service';
import { Table, Button, Modal, Form, Alert, Spinner, Badge, Card, Row, Col, Dropdown } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaKey, FaUserShield, FaUserTag } from 'react-icons/fa';
import './UserManagement.css'; // We'll create this CSS file next

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // For editing
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'agent',
  });
  const [assignedDesks, setAssignedDesks] = useState([]); // Array of desk IDs

  const fetchUsersAndDesks = useCallback(async () => {
    setLoading(true);
    try {
      const usersData = await AdminService.getAllUsers();
      const desksData = await AdminService.getAllDesks();
      setUsers(usersData || []);
      setDesks(desksData || []);
      setError('');
    } catch (err) {
      setError('Failed to fetch data. ' + (err.message || ''));
      setUsers([]);
      setDesks([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsersAndDesks();
  }, [fetchUsersAndDesks]);

  // Auto-dismiss success and error messages after 3 seconds
  useEffect(() => {
    if (successMessage || error) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
        setError('');
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage, error]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleDeskAssignmentChange = (deskId) => {
    setAssignedDesks(prev => 
      prev.includes(deskId) ? prev.filter(id => id !== deskId) : [...prev, deskId]
    );
  };

  const resetFormData = () => {
    setFormData({ username: '', email: '', password: '', role: 'agent' });
    setAssignedDesks([]);
    setCurrentUser(null);
    setIsEditMode(false);
  };

  const handleShowAddModal = () => {
    resetFormData();
    setShowModal(true);
  };

  const handleShowEditModal = useCallback(async (user) => {
    resetFormData();
    setIsEditMode(true);
    setCurrentUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // Password not fetched, only set if changing
      role: user.role,
    });
    try {
        const userAssignments = await AdminService.getUserAssignments(user.id);
        setAssignedDesks(userAssignments.map(desk => desk.id)); 
    } catch (err) {
        setError('Failed to fetch user desk assignments. ' + (err.message || ''));
        setAssignedDesks([]);
    }
    setShowModal(true);
  }, []);

  const handleCloseModal = () => {
    setShowModal(false);
    resetFormData();
    setError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    const userData = { ...formData };
    if (!isEditMode && !userData.password) {
      setError('Password is required for new users.');
      setLoading(false);
      return;
    }
    if (isEditMode && !userData.password) {
      delete userData.password; // Don't send empty password for updates
    }

    try {
      let response;
      if (isEditMode && currentUser) {
        response = await AdminService.updateUser(currentUser.id, userData);
        setSuccessMessage(response.message || 'User updated successfully!');
        // Update desk assignments
        const currentAssignments = await AdminService.getUserAssignments(currentUser.id);
        const currentDeskIds = currentAssignments.map(d => d.id);
        // Unassign desks no longer selected
        for (const deskId of currentDeskIds) {
          if (!assignedDesks.includes(deskId)) {
            await AdminService.unassignUserFromDesk(currentUser.id, deskId);
          }
        }
        // Assign new desks
        for (const deskId of assignedDesks) {
          if (!currentDeskIds.includes(deskId)) {
            await AdminService.assignUserToDesk(currentUser.id, deskId);
          }
        }
      } else {
        response = await AdminService.createUser(userData);
        setSuccessMessage(response.message || 'User created successfully!');
        // Assign desks for new user
        if (response.user && response.user.id) {
            for (const deskId of assignedDesks) {
                await AdminService.assignUserToDesk(response.user.id, deskId);
            }
        }
      }
      fetchUsersAndDesks(); // Refresh user list
      setTimeout(() => handleCloseModal(), 2000); // Close modal after 2s on success
    } catch (err) {
      setError('Operation failed. ' + (err.message || (err.response?.data?.message) || 'Please try again.'));
    }
    setLoading(false);
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      setLoading(true);
      setError('');
      setSuccessMessage('');
      try {
        await AdminService.deleteUser(userId);
        setSuccessMessage('User deleted successfully!');
        fetchUsersAndDesks(); // Refresh user list
      } catch (err) {
        setError('Failed to delete user. ' + (err.message || ''));
      }
      setLoading(false);
    }
  };

  if (loading && users.length === 0 && desks.length === 0) {
    return <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}><Spinner animation="border" /> Loading Users...</div>;
  }

  return (
    <div className="user-management-container p-4">
      <Card className="shadow-sm">
        <Card.Header as="h2" className="d-flex justify-content-between align-items-center">
          User Management
          <Button variant="primary" onClick={handleShowAddModal}><FaPlus /> Add User</Button>
        </Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          
          {loading && <div className="text-center mb-3"><Spinner animation="border" size="sm" /> Refreshing data...</div>}

          <Table striped bordered hover responsive className="mt-3">
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>
                    {user.role === 'admin' ? 
                      <Badge bg="danger"><FaUserShield /> Admin</Badge> : 
                      <Badge bg="secondary"><FaUserTag /> Agent</Badge>}
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <Button variant="outline-primary" size="sm" onClick={() => handleShowEditModal(user)} className="me-2">
                      <FaEdit /> Edit
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => handleDeleteUser(user.id)}>
                      <FaTrash /> Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr><td colSpan="6" className="text-center">No users found.</td></tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Add/Edit User Modal */}
      <Modal show={showModal} onHide={handleCloseModal} backdrop="static" keyboard={false} centered>
        <Modal.Header closeButton>
          <Modal.Title>{isEditMode ? 'Edit User' : 'Add New User'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="formUsername">
              <Form.Label>Username</Form.Label>
              <Form.Control type="text" name="username" value={formData.username} onChange={handleInputChange} required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="formEmail">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" name="email" value={formData.email} onChange={handleInputChange} required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="formPassword">
              <Form.Label>{isEditMode ? 'New Password (leave blank to keep current)' : 'Password'}</Form.Label>
              <Form.Control type="password" name="password" value={formData.password} onChange={handleInputChange} required={!isEditMode} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="formRole">
              <Form.Label>Role</Form.Label>
              <Form.Select name="role" value={formData.role} onChange={handleInputChange}>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </Form.Select>
            </Form.Group>

            {formData.role === 'agent' && desks.length > 0 && (
                <Form.Group className="mb-3">
                    <Form.Label>Assign to Desks</Form.Label>
                    <div className="desk-assignment-checkboxes">
                        {desks.map(desk => (
                            <Form.Check 
                                type="checkbox" 
                                key={desk.id} 
                                id={`desk-${desk.id}`}
                                label={desk.name}
                                checked={assignedDesks.includes(desk.id)}
                                onChange={() => handleDeskAssignmentChange(desk.id)}
                            />
                        ))}
                    </div>
                </Form.Group>
            )}
            {formData.role === 'agent' && desks.length === 0 && (
                <Alert variant="info">No desks available to assign. Please create desks first.</Alert>
            )}

            <Row className="mt-4">
              <Col>
                <Button variant="secondary" onClick={handleCloseModal} className="w-100">
                  Cancel
                </Button>
              </Col>
              <Col>
                <Button variant="primary" type="submit" disabled={loading} className="w-100">
                  {loading ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> Saving...</> : (isEditMode ? 'Save Changes' : 'Create User')}
                </Button>
              </Col>
            </Row>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default UserManagement;
