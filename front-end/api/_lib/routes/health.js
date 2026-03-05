const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/health — Health check (public)
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };

    res.json({
        status: dbState === 1 ? 'OK' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        database: dbStatus[dbState] || 'unknown',
        uptime: process.uptime()
    });
});

module.exports = router;
