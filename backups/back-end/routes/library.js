const express = require('express');
const Note = require('../models/Note');
const SharedNote = require('../models/SharedNote');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/library — List all shared notes (public)
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const filters = {};

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filters.$or = [
                { title: searchRegex },
                { tags: searchRegex },
                { username: searchRegex }
            ];
        }

        const sharedNotes = await SharedNote.find(filters)
            .sort({ createdAt: -1 })
            .lean();

        res.json({ sharedNotes });
    } catch (error) {
        console.error('Get library error:', error);
        res.status(500).json({ error: 'Failed to retrieve library' });
    }
});

// ─────────────────────────────────────────────
// POST /api/library/publish — Publish a note (protected)
// ─────────────────────────────────────────────
router.post('/publish', protect, async (req, res) => {
    try {
        const { noteId, description } = req.body;

        if (!noteId) {
            return res.status(400).json({ error: 'Note ID is required' });
        }

        // Find the source note
        const note = await Note.findOne({
            _id: noteId,
            userId: req.user._id
        });

        if (!note) {
            return res.status(404).json({ error: 'Note not found or you don\'t own it' });
        }

        // Check if already published
        const existing = await SharedNote.findOne({
            userId: req.user._id,
            originalNoteId: note._id
        });

        if (existing) {
            // Update existing shared note instead of creating duplicate
            existing.title = note.title;
            existing.content = note.content;
            existing.tags = note.tags;
            existing.description = description || existing.description;
            existing.frontEndData = note.frontEndData;
            await existing.save();

            return res.json({ sharedNote: existing, updated: true });
        }

        // Create shared note
        const sharedNote = await SharedNote.create({
            userId: req.user._id,
            username: req.user.displayName || req.user.username,
            originalNoteId: note._id,
            title: note.title,
            content: note.content,
            description: description || '',
            tags: note.tags,
            frontEndData: note.frontEndData
        });

        res.status(201).json({ sharedNote });
    } catch (error) {
        console.error('Publish error:', error);
        res.status(500).json({ error: 'Failed to publish note' });
    }
});

// ─────────────────────────────────────────────
// GET /api/library/my-published — Get user's published notes (protected)
// ─────────────────────────────────────────────
router.get('/my-published', protect, async (req, res) => {
    try {
        const sharedNotes = await SharedNote.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .lean();

        res.json({ sharedNotes });
    } catch (error) {
        console.error('Get my published error:', error);
        res.status(500).json({ error: 'Failed to retrieve published notes' });
    }
});

// ─────────────────────────────────────────────
// POST /api/library/:id/clone — Clone a shared note (protected)
// ─────────────────────────────────────────────
router.post('/:id/clone', protect, async (req, res) => {
    try {
        const sharedNote = await SharedNote.findById(req.params.id);

        if (!sharedNote) {
            return res.status(404).json({ error: 'Shared note not found' });
        }

        // Create a new note for the current user based on the shared note
        const clonedNote = await Note.create({
            userId: req.user._id,
            title: sharedNote.title + ' (cloned)',
            content: sharedNote.content,
            sections: sharedNote.frontEndData?.sections || [],
            tags: sharedNote.tags,
            category: sharedNote.frontEndData?.category || 'General',
            metadata: sharedNote.frontEndData?.metadata || {},
            frontEndData: {
                ...sharedNote.frontEndData,
                isLibraryClone: true,
                clonedFrom: sharedNote._id
            }
        });

        res.status(201).json({ note: clonedNote });
    } catch (error) {
        console.error('Clone error:', error);
        res.status(500).json({ error: 'Failed to clone note' });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/library/:id — Remove from library (owner only, protected)
// ─────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
    try {
        const sharedNote = await SharedNote.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!sharedNote) {
            return res.status(404).json({ error: 'Shared note not found or you don\'t own it' });
        }

        await SharedNote.findByIdAndDelete(req.params.id);

        res.json({ message: 'Removed from library' });
    } catch (error) {
        console.error('Delete shared note error:', error);
        res.status(500).json({ error: 'Failed to remove from library' });
    }
});

// ─────────────────────────────────────────────
// POST /api/library/upload — Upload a note directly without local DB dependency
// ─────────────────────────────────────────────
router.post('/upload', protect, async (req, res) => {
    try {
        const { title, content, description, tags, frontEndData } = req.body;
        // Generate a mock ID for the required originalNoteId field since it doesn't exist locally
        const mongoose = require('mongoose');
        const mockOriginalId = new mongoose.Types.ObjectId();

        const sharedNote = await SharedNote.create({
            userId: req.user._id,
            username: req.user.displayName || req.user.username,
            originalNoteId: mockOriginalId,
            title: title || 'Imported Note',
            content: content || '',
            description: description || '',
            tags: tags || [],
            frontEndData: frontEndData || {}
        });
        res.status(201).json({ sharedNote });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload note to library' });
    }
});

module.exports = router;
