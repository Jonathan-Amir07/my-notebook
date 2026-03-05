const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// Helper: determine front-end origin for redirects
function getFrontEndUrl(req) {
    // On Vercel, API and frontend share the same domain
    if (process.env.VERCEL) {
        return `${req.protocol}://${req.get('host')}`;
    }
    return process.env.FRONTEND_URL || 'http://localhost:5500/front-end';
}

// ─────────────────────────────────────────────
// GET /api/auth/google — Start Google OAuth flow
// ─────────────────────────────────────────────
router.get('/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.redirect(
            getFrontEndUrl(req) + '/login.html?error=oauth_unconfigured'
        );
    }
    passport.authenticate('google', {
        scope: ['profile', 'email']
    })(req, res, next);
});

// ─────────────────────────────────────────────
// GET /api/auth/google/callback — Google redirects here
// ─────────────────────────────────────────────
router.get('/google/callback',
    (req, res, next) => {
        passport.authenticate('google', {
            session: false,
            failureRedirect: getFrontEndUrl(req) + '/login.html?error=oauth_failed'
        })(req, res, next);
    },
    async (req, res) => {
        try {
            const token = generateToken(req.user._id);
            const userObj = encodeURIComponent(JSON.stringify(req.user.toPublic()));
            res.redirect(
                getFrontEndUrl(req) + `/login.html?token=${token}&user=${userObj}`
            );
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.redirect(getFrontEndUrl(req) + '/login.html?error=oauth_failed');
        }
    }
);

module.exports = router;
