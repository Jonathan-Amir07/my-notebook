require('dotenv').config();

const express = require('express');
const cors = require('cors');
const passport = require('passport');
const { rateLimit } = require('express-rate-limit');
const connectDB = require('./config/db');
const configurePassport = require('./config/passport');

// Import routes
const authRoutes = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const libraryRoutes = require('./routes/library');
const statsRoutes = require('./routes/stats');
const syncRoutes = require('./routes/sync');
const healthRoutes = require('./routes/health');
const googleAuthRoutes = require('./routes/google-auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

// CORS — allow front-end origins (dynamic, reads from env)
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
];
// Add production front-end URL from env (e.g. https://your-app.vercel.app)
if (process.env.FRONTEND_URL) {
    // Extract just the origin (protocol + host) from FRONTEND_URL
    try {
        const url = new URL(process.env.FRONTEND_URL);
        allowedOrigins.push(url.origin);
    } catch (e) {
        allowedOrigins.push(process.env.FRONTEND_URL);
    }
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Passport initialization (no sessions — we use JWT)
app.use(passport.initialize());
configurePassport();

// Rate limiting — prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 requests per window
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts, please try again later' }
});
app.use('/api/auth/', authLimiter);

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

// Root route
app.get('/', (req, res) => {
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

// ─────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        app.listen(PORT, () => {
            console.log('');
            console.log('═══════════════════════════════════════════');
            console.log(`  📝 Notes App API Server`);
            console.log(`  🌐 http://localhost:${PORT}`);
            console.log(`  💊 http://localhost:${PORT}/api/health`);
            console.log('═══════════════════════════════════════════');
            console.log('');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
