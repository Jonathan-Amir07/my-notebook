const express = require('express');
const cors = require('cors');
const passport = require('passport');
const connectDB = require('./db');
const configurePassport = require('./passport');

// Import routes
const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const libraryRoutes = require('./routes/library');
const statsRoutes = require('./routes/stats');
const syncRoutes = require('./routes/sync');
const healthRoutes = require('./routes/health');
const googleAuthRoutes = require('./routes/google-auth');

// Pipeline route — wrapped in try/catch because it depends on @google/generative-ai
// If the package is unavailable, the rest of the API continues to work normally.
let pipelineRoutes = null;
try {
    pipelineRoutes = require('./routes/pipeline');
} catch (e) {
    console.warn('[Pipeline] Route failed to load:', e.message);
}

const app = express();

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

// CORS
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
];
if (process.env.FRONTEND_URL) {
    try {
        const url = new URL(process.env.FRONTEND_URL);
        allowedOrigins.push(url.origin);
    } catch (e) {
        allowedOrigins.push(process.env.FRONTEND_URL);
    }
}

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Passport (no sessions — JWT only)
app.use(passport.initialize());
configurePassport();

// ─────────────────────────────────────────────
// Connect to DB before handling requests
// ─────────────────────────────────────────────
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('DB connection failed:', error);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/health', healthRoutes);
if (pipelineRoutes) {
    app.use('/api/pipeline', pipelineRoutes);
} else {
    app.use('/api/pipeline', (req, res) => res.status(503).json({ error: 'Pipeline service unavailable' }));
}

// Root API info
app.get('/api', (req, res) => {
    res.json({
        message: '📝 Notes App API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            notes: '/api/notes',
            library: '/api/library',
            stats: '/api/stats',
            sync: '/api/sync'
        }
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

module.exports = app;
