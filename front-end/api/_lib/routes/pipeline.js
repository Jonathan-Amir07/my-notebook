const express = require('express');
const router = express.Router();
const ai = require('../ai');
const auth = require('../middleware/auth');

/**
 * @route POST /api/pipeline/generate
 * @desc  Entry point for processing lecture text through the study pipeline.
 *        Supports various "task" types (notebook, mindmap, slides, flashcards).
 */
router.post('/generate', auth, async (req, res) => {
    const { text, task, styleData } = req.body;

    if (!text || !task) {
        return res.status(400).json({ error: 'Text and Task type are required.' });
    }

    try {
        let result;
        switch (task) {
            case 'notebook':
                // Stage 1: Initial Structured Notebook
                // STYLE_INSTRUCTIONS_PENDING: Placeholder until user instructs.
                const notebookPrompt = `Convert the following lecture text into a structured academic notebook.
                Style: ${styleData || 'Standard Academic'}.
                Focus: Key concepts, methodology, and core conclusions.
                Format as HTML (use <h1> for topics, <p> for detail, <ul> for lists).`;
                result = await ai.analyzeContent(text, notebookPrompt, false);
                break;

            case 'mindmap':
                // Stage 2: Concurrent MindMap data
                const mindMapPrompt = `Based on the lecture text provided, generate a hierarchical mind map structure.
                Respond STRICTLY with valid JSON mirroring this schema:
                { "central": "The main topic", "branches": [ { "label": "Sub-topic", "children": ["point 1", "point 2"] } ] }`;
                result = await ai.analyzeContent(text, mindMapPrompt, true);
                break;

            case 'slides':
                // Stage 2: Concurrent Presentation Slides
                const slidesPrompt = `Convert the core findings from this lecture into 6-10 infographic slide cards.
                Focus on visual storytelling. Give each slide a title, a brief focal point, and an icon emoji.
                Respond STRICTLY with valid JSON mirroring this schema:
                [ { "title": "...", "content": "...", "icon": "emoji", "color": "hex_code" } ]`;
                result = await ai.analyzeContent(text, slidesPrompt, true);
                break;

            case 'flashcards':
                // Stage 2: Concurrent Flashcard Q&A pairs
                const flashcardsPrompt = `Generate 10 critical study flashcards from this lecture text.
                Format as valid JSON: [ { "q": "Question Text", "a": "Detailed Answer Text" } ]`;
                result = await ai.analyzeContent(text, flashcardsPrompt, true);
                break;

            default:
                return res.status(400).json({ error: 'Invalid pipeline task.' });
        }

        res.json({ success: true, task, data: result });
    } catch (error) {
        console.error(`Pipeline ${task} failure:`, error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
