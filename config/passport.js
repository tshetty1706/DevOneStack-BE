import 'dotenv/config'; // must be first — ESM hoists imports, so this runs before strategy registration
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import User from "../models/User.js";

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${process.env.SERVER_URL}/api/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let user = await User.findOne({ provider: "google", providerId: profile.id });
                if (!user) {
                    user = await User.create({
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        avatar: profile.photos?.[0]?.value,
                        provider: "google",
                        providerId: profile.id,
                    });
                }
                done(null, user);
            } catch (err) {
                done(err, null);
            }
        }
    )
);

passport.use(
    new GitHubStrategy(
        {
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: `${process.env.SERVER_URL}/api/auth/github/callback`,
            scope: ["user:email"],
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let user = await User.findOne({ provider: "github", providerId: profile.id });
                if (!user) {
                    const email =
                        profile.emails?.[0]?.value || `${profile.username}@users.noreply.github.com`;
                    user = await User.create({
                        name: profile.displayName || profile.username,
                        email,
                        avatar: profile.photos?.[0]?.value,
                        provider: "github",
                        providerId: profile.id,
                    });
                }
                done(null, user);
            } catch (err) {
                done(err, null);
            }
        }
    )
);

export default passport;