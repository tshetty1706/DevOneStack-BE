import express from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { signAccessToken, signRefreshToken, cookieOptions } from "../utils/tokens.js";

const router = express.Router();

const issueTokensAndRedirect = async (req, res) => {
    const accessToken = signAccessToken(req.user._id);
    const refreshToken = signRefreshToken(req.user._id);

    req.user.refreshToken = refreshToken;
    await req.user.save();

    res.cookie("refreshToken", refreshToken, cookieOptions);
    res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
};

// ---- Google ----
router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
);
router.get("/google/callback", (req, res, next) => {
    passport.authenticate("google", { session: false }, async (err, user, info) => {
        if (err) {
            if (err.message && err.message.startsWith("account_exists:")) {
                const provider = err.message.split(":")[1];
                return res.redirect(`${process.env.CLIENT_URL}/login?error=account_exists&provider=${provider}`);
            }
            return res.redirect(`${process.env.CLIENT_URL}/login?error=google`);
        }
        if (!user) return res.redirect(`${process.env.CLIENT_URL}/login?error=google`);
        req.user = user;
        await issueTokensAndRedirect(req, res);
    })(req, res, next);
});

// ---- GitHub ----
router.get("/github", passport.authenticate("github", { session: false }));
router.get("/github/callback", (req, res, next) => {
    passport.authenticate("github", { session: false }, async (err, user, info) => {
        if (err) {
            if (err.message && err.message.startsWith("account_exists:")) {
                const provider = err.message.split(":")[1];
                return res.redirect(`${process.env.CLIENT_URL}/login?error=account_exists&provider=${provider}`);
            }
            return res.redirect(`${process.env.CLIENT_URL}/login?error=github`);
        }
        if (!user) return res.redirect(`${process.env.CLIENT_URL}/login?error=github`);
        req.user = user;
        await issueTokensAndRedirect(req, res);
    })(req, res, next);
});

// ---- Email/password signup ----
router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ message: "Account already exists", provider: existing.provider });
        }

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: hashed, provider: "local" });

        const accessToken = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);
        user.refreshToken = refreshToken;
        await user.save();

        res.cookie("refreshToken", refreshToken, cookieOptions);
        res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.status(201).json({ user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ message: "Signup failed" });
    }
});

// ---- Email/password login ----
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, provider: "local" }).select("+password");
        if (!user) return res.status(401).json({ message: "Invalid credentials" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: "Invalid credentials" });

        const accessToken = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);
        user.refreshToken = refreshToken;
        await user.save();

        res.cookie("refreshToken", refreshToken, cookieOptions);
        res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.json({ user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ message: "Login failed" });
    }
});

// ---- Refresh access token ----
router.post("/refresh", async (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id).select("+refreshToken");
        if (!user || user.refreshToken !== token) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }
        const accessToken = signAccessToken(user._id);
        res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.json({ message: "Refreshed" });
    } catch (err) {
        res.status(403).json({ message: "Refresh token expired or invalid" });
    }
});

// ---- Logout ----
router.post("/logout", async (req, res) => {
    const token = req.cookies.refreshToken;
    if (token) {
        const decoded = jwt.decode(token);
        if (decoded?.id) {
            await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
        }
    }
    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
    res.json({ message: "Logged out" });
});

// ---- Current user ----
router.get("/me", async (req, res) => {
    const token = req.cookies.accessToken;
    if (!token) return res.status(401).json({ message: "Not authenticated" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ message: "User not found" });
        res.json({ user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar } });
    } catch (err) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
});

export default router;