const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('./models/User');

function configurePassport() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log('Google OAuth not configured (missing credentials)');
        return;
    }

    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            const displayName = profile.displayName || email.split('@')[0];

            let user = await User.findOne({ email });

            if (user) {
                return done(null, user);
            }

            user = await User.create({
                username: displayName.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now().toString(36),
                email,
                password: 'oauth_' + Date.now() + '_' + Math.random().toString(36),
                displayName
            });

            return done(null, user);
        } catch (error) {
            console.error('Google OAuth error:', error);
            return done(error, null);
        }
    }));

    console.log('Google OAuth configured');
}

module.exports = configurePassport;
