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
      callbackURL: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("Email not returned by Google"), null);
          }

          // Check if email exists (e.g. from local signup or google)
          let existingUser = await User.findOne({ email });
          if (existingUser) {
            // MERGE: link googleId and set verified
            existingUser.googleId = profile.id;
            existingUser.isVerified = true;
            if (!existingUser.avatarUrl) {
              existingUser.avatarUrl = profile.photos?.[0]?.value;
            }
            await existingUser.save();
            return done(null, existingUser);
          }

          // Create new google user
          user = await User.create({
            googleId: profile.id,
            email,
            displayName: profile.displayName || profile.name?.givenName || "Google User",
            avatarUrl: profile.photos?.[0]?.value,
            provider: "google",
            isVerified: true,
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;