import 'dotenv/config';
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL || 'http://localhost:9000'}/api/auth/google/callback`,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const mode = req.query.state || 'login'; // 'login' or 'signup'
        const email = profile.emails?.[0]?.value ? profile.emails[0].value.trim().toLowerCase() : null;

        if (!email) {
          return done(new Error("Email not returned by Google"), null);
        }

        // 1. Single query to check by googleId or email
        let user = await User.findOne({
          $or: [
            { googleId: profile.id },
            { email: email }
          ]
        });

        if (user) {
          // Check provider separation
          if (user.provider === 'local') {
            // CRITICAL: Local accounts MUST NOT log in via Google OAuth.
            // Do NOT overwrite provider, do NOT link googleId, do NOT silently create duplicate.
            return done(null, false, { message: "account_exists_local" });
          }

          if (user.provider === 'google') {
            // Google OAuth account -> allow login
            if (!user.googleId) {
              user.googleId = profile.id;
            }
            user.isVerified = true;
            if (!user.avatarUrl && profile.photos?.[0]?.value) {
              user.avatarUrl = profile.photos[0].value;
            }
            if (profile.photos?.[0]?.value) {
              user.googleAvatarUrl = profile.photos[0].value;
            }
            await user.save();
            return done(null, user);
          }

          // Fallback for any other provider
          return done(null, false, { message: "account_exists_other" });
        }

        // 2. User does NOT exist in database:
        if (mode === 'signup') {
          // Explicit signup flow from /signup -> create account
          user = await User.create({
            googleId: profile.id,
            email,
            displayName: profile.displayName || profile.name?.givenName || "Developer",
            avatarUrl: profile.photos?.[0]?.value,
            googleAvatarUrl: profile.photos?.[0]?.value,
            provider: "google",
            isVerified: true,
          });
          return done(null, user);
        } else {
          // Login flow -> REJECT because account does not exist in DB
          return done(null, false, { message: "account_not_found" });
        }
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;