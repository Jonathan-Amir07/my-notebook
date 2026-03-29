const mongoose = require('mongoose');

const sharedNoteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    originalNoteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Note',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    tags: [String],
    // Store the full front-end data for faithful reproduction
    frontEndData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Prevent duplicate publishing of the same note
sharedNoteSchema.index({ userId: 1, originalNoteId: 1 }, { unique: true });

module.exports = mongoose.model('SharedNote', sharedNoteSchema);
