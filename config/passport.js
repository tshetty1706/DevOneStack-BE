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

        // 1. Check by googleId
        let user = await User.findOne({ googleId: profile.id });

        // 2. Check by email if not found by googleId
        if (!user) {
          user = await User.findOne({ email });
        }

        if (user) {
          // Existing user: ensure googleId is linked, verified, and avatar updated if missing
          if (!user.googleId) {
            user.googleId = profile.id;
          }
          user.isVerified = true;
          if (!user.avatarUrl && profile.photos?.[0]?.value) {
            user.avatarUrl = profile.photos[0].value;
          }
          await user.save();
          return done(null, user);
        }

        // 3. User does NOT exist in database:
        if (mode === 'signup') {
          // Explicit signup flow from /signup -> create account
          user = await User.create({
            googleId: profile.id,
            email,
            displayName: profile.displayName || profile.name?.givenName || "Developer",
            avatarUrl: profile.photos?.[0]?.value,
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