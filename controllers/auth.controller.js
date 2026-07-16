import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { signAccessToken, signRefreshToken } from "../utils/jwt.js";
import { sendVerificationEmail, sendResetPasswordEmail, sendResetConfirmationEmail } from "../utils/email.js";

// Helper to validate password strength
const isPasswordStrong = (pwd) => {
  const minLength = pwd.length >= 8;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  return minLength && hasUppercase && hasNumber && hasSpecial;
};

// Helper for cookie options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

export const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Validate inputs
    if (!email || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!username || !/^[a-zA-Z0-9]{3,20}$/.test(username)) {
      return res.status(400).json({ error: "That username is taken. Try a different one." }); // username is 3-20 alphanumeric
    }
    if (!password || !isPasswordStrong(password)) {
      return res.status(400).json({ error: "Password needs 8+ chars, one uppercase, one number, one special character." });
    }

    // 2. Check duplicate email
    const duplicateEmail = await User.findOne({ email });
    if (duplicateEmail) {
      return res.status(400).json({ error: "An account with this email already exists. Try logging in." });
    }

    // 3. Check duplicate username
    const duplicateUsername = await User.findOne({ username });
    if (duplicateUsername) {
      return res.status(400).json({ error: "That username is taken. Try a different one." });
    }

    // 4. Create verification token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // 5. Create user (password hash handled in pre-save hook)
    const user = new User({
      username,
      email,
      passwordHash: password,
      displayName: username,
      isVerified: false,
      verifyToken,
      verifyTokenExpiry,
      provider: "local",
    });
    await user.save();

    // 6. Send verification email
    try {
      await sendVerificationEmail(email, verifyToken);
    } catch (err) {
      console.error("Error sending verification email:", err.message);
    }

    return res.status(201).json({ message: "Account created. Please verify your email." });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Incorrect email or password." });
    }

    // Find user (include select fields for passwordHash and verifyToken)
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || user.provider !== "local") {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    // Check locking
    if (user.isLocked) {
      return res.status(423).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
    }

    // Check verification
    if (!user.isVerified) {
      return res.status(403).json({ error: "Please verify your email first.", unverified: true });
    }

    // Compare password
    const match = await user.comparePassword(password);
    if (!match) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // 15 mins lock
        await user.save();
        return res.status(423).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
      }
      await user.save();
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    // Password correct: reset lock & attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Sign tokens
    const accessToken = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    res.cookie("refreshToken", refreshToken, getCookieOptions());

    return res.json({
      accessToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const logout = async (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  return res.status(200).json({ message: "Logged out successfully" });
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      verifyToken: token,
      verifyTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "This verification link has expired or already been used." });
    }

    user.isVerified = true;
    user.verifyToken = undefined;
    user.verifyTokenExpiry = undefined;
    await user.save();

    // Sign tokens & auto login
    const accessToken = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    res.cookie("refreshToken", refreshToken, getCookieOptions());

    return res.status(200).json({
      accessToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Please enter your email address." });
    }

    const user = await User.findOne({ email, provider: "local" });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.resetToken = resetToken;
      user.resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
      await user.save();

      try {
        await sendResetPasswordEmail(email, resetToken);
      } catch (mailErr) {
        console.error("Forgot password mail error:", mailErr.message);
      }
    }

    // Always return 200 for security
    return res.status(200).json({ message: "If that email exists, a link was sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || !isPasswordStrong(password)) {
      return res.status(400).json({ error: "Password needs 8+ chars, one uppercase, one number, one special character." });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    }).select("+passwordHash");

    if (!user) {
      return res.status(400).json({ error: "This reset link has expired or already been used. Request a new one." });
    }

    // Ensure new password !== old
    const match = await user.comparePassword(password);
    if (match) {
      return res.status(400).json({ error: "New password cannot be the same as your old password." });
    }

    // Set new password (pre-save hashes it)
    user.passwordHash = password;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    try {
      await sendResetConfirmationEmail(user.email);
    } catch (mailErr) {
      console.error("Confirmation mail error:", mailErr.message);
    }

    return res.status(200).json({ message: "Password reset successful." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const refresh = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({ error: "No refresh token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Refresh token expired or invalid" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    const accessToken = signAccessToken(user._id);
    return res.json({ accessToken });
  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const getMe = async (req, res) => {
  // protectRoute populated req.user
  return res.json({ user: req.user });
};