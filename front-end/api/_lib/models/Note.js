const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    tags: [String]
}, { _id: false });

const noteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        default: 'Untitled'
    },
    content: {
        type: String,
        default: ''
    },
    sections: [sectionSchema],
    tags: [String],
    category: {
        type: String,
        default: 'General'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Store the full front-end chapter object as-is for perfect round-tripping
    frontEndData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Index for efficient querying
noteSchema.index({ userId: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('Note', noteSchema);
