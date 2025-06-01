const express = require('express');
const router = express.Router();
const { supabase } = require('../config/db.config');

/**
 * @route GET /api/health
 * @desc Health check endpoint to verify server and database status
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    // Check database connection
    const startTime = Date.now();
    const { data, error } = await supabase.from('desks').select('count').limit(1);
    const dbResponseTime = Date.now() - startTime;
    
    const dbStatus = error ? 'error' : 'connected';
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    // Return health status
    res.status(200).json({
      status: 'ok',
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() + ' seconds',
      database: {
        status: dbStatus,
        responseTime: dbResponseTime + 'ms',
        error: error ? error.message : null
      },
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

module.exports = router;
