const express = require('express');
const Note = require('../models/Note');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/sync — Sync notes updated since lastSync (protected)
// ─────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
    try {
        const { lastSync } = req.query;
        const filters = { userId: req.user._id };

        if (lastSync) {
            filters.updatedAt = { $gte: new Date(lastSync) };
        }

        const notes = await Note.find(filters)
            .sort({ updatedAt: -1 })
            .lean();

        res.json({
            notes,
            syncTime: new Date().toISOString()
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

module.exports = router;
