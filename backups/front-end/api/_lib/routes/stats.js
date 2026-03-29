const express = require('express');
const Note = require('../models/Note');
const SharedNote = require('../models/SharedNote');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/stats — User statistics (protected)
// ─────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        // Count notes
        const totalNotes = await Note.countDocuments({ userId });

        // Count published
        const totalPublished = await SharedNote.countDocuments({ userId });

        // Get tag breakdown
        const notes = await Note.find({ userId }).select('tags category').lean();
        const tagCounts = {};
        const categoryCounts = {};

        notes.forEach(note => {
            // Count tags
            (note.tags || []).forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
            // Count categories
            const cat = note.category || 'General';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        res.json({
            totalNotes,
            totalPublished,
            tagCounts,
            categoryCounts
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

module.exports = router;
