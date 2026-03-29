const express = require('express');
const Note = require('../models/Note');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All note routes are protected
router.use(protect);

// ─────────────────────────────────────────────
// GET /api/notes — List user's notes
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const filters = { userId: req.user._id };

        // Optional query filters
        if (req.query.category) filters.category = req.query.category;
        if (req.query.tag) filters.tags = req.query.tag;

        const notes = await Note.find(filters)
            .sort({ updatedAt: -1 })
            .lean();

        res.json({ notes });
    } catch (error) {
        console.error('Get notes error:', error);
        res.status(500).json({ error: 'Failed to retrieve notes' });
    }
});

// ─────────────────────────────────────────────
// GET /api/notes/:id — Get single note
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const note = await Note.findOne({
            _id: req.params.id,
            userId: req.user._id
        }).lean();

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.json({ note });
    } catch (error) {
        console.error('Get note error:', error);
        res.status(500).json({ error: 'Failed to retrieve note' });
    }
});

// ─────────────────────────────────────────────
// POST /api/notes — Create note
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { title, content, sections, tags, category, metadata, frontEndData } = req.body;

        const note = await Note.create({
            userId: req.user._id,
            title: title || 'Untitled',
            content: content || '',
            sections: sections || [],
            tags: tags || [],
            category: category || 'General',
            metadata: metadata || {},
            frontEndData: frontEndData || {}
        });

        res.status(201).json({ note });
    } catch (error) {
        console.error('Create note error:', error);
        res.status(500).json({ error: 'Failed to create note' });
    }
});

// ─────────────────────────────────────────────
// PUT /api/notes/:id — Update note
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const note = await Note.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Update allowed fields
        const updatableFields = ['title', 'content', 'sections', 'tags', 'category', 'metadata', 'frontEndData'];
        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                note[field] = req.body[field];
            }
        });

        await note.save();

        res.json({ note });
    } catch (error) {
        console.error('Update note error:', error);
        res.status(500).json({ error: 'Failed to update note' });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/notes/:id — Delete note
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const note = await Note.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Delete note error:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// ─────────────────────────────────────────────
// POST /api/notes/bulk-delete — Delete multiple notes
// ─────────────────────────────────────────────
router.post('/bulk-delete', async (req, res) => {
    try {
        const { noteIds } = req.body;

        if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
            return res.status(400).json({ error: 'Please provide an array of note IDs' });
        }

        const result = await Note.deleteMany({
            _id: { $in: noteIds },
            userId: req.user._id
        });

        res.json({
            message: `${result.deletedCount} note(s) deleted`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ error: 'Failed to delete notes' });
    }
});

module.exports = router;
