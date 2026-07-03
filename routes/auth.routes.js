import express from "express";
import passport from "passport";
import {
  signup,
  login,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
  refresh,
  getMe,
} from "../controllers/auth.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { loginLimiter, signupLimiter, forgotPasswordLimiter } from "../middleware/rateLimiter.js";
import { signAccessToken, signRefreshToken } from "../utils/jwt.js";

const router = express.Router();

// Local Auth Endpoints with Rate Limiters
router.post("/signup", signupLimiter, signup);
router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Session Verification & Refresh
router.get("/me", protectRoute, getMe);
router.post("/refresh", refresh);

// Passport Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  (req, res, next) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${clientUrl}/login?error=oauth_failed`,
    })(req, res, next);
  },
  async (req, res) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
    try {
      const accessToken = signAccessToken(req.user._id);
      const refreshToken = signRefreshToken(req.user._id);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.redirect(`${clientUrl}/oauth/callback#token=${accessToken}`);
    } catch (err) {
      console.error("Google OAuth callback error:", err);
      return res.redirect(`${clientUrl}/login?error=oauth_failed`);
    }
  }
);

// Passport GitHub OAuth
router.get(
  "/github",
  passport.authenticate("github", { session: false })
);

router.get(
  "/github/callback",
  (req, res, next) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
    passport.authenticate("github", {
      session: false,
      failureRedirect: `${clientUrl}/login?error=oauth_failed`,
    })(req, res, next);
  },
  async (req, res) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
    try {
      const accessToken = signAccessToken(req.user._id);
      const refreshToken = signRefreshToken(req.user._id);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.redirect(`${clientUrl}/oauth/callback#token=${accessToken}`);
    } catch (err) {
      console.error("GitHub OAuth callback error:", err);
      return res.redirect(`${clientUrl}/login?error=oauth_failed`);
    }
  }
);

export default router;
