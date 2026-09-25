import express from "express";
import passport from "passport";
import {
  signup,
  login,
  logout,
  verifyEmail,
  resendVerification,
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
router.post("/resend-verification", signupLimiter, resendVerification);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Session Verification & Refresh
router.get("/me", protectRoute, getMe);
router.post("/refresh", refresh);

// Passport Google OAuth
router.get("/google", (req, res, next) => {
  const mode = req.query.mode === "signup" ? "signup" : "login";
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: mode,
    session: false,
  })(req, res, next);
});

router.get(
  "/google/callback",
  (req, res, next) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${clientUrl}/login?error=account_not_found&provider=google`,
    })(req, res, next);
  },
  async (req, res) => {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
    try {
      if (!req.user) {
        return res.redirect(`${clientUrl}/login?error=account_not_found&provider=google`);
      }
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
      return res.redirect(`${clientUrl}/login?error=account_not_found&provider=google`);
    }
  }
);

export default router;
