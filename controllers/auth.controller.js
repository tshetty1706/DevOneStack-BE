import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signAccessToken, signRefreshToken } from "../utils/jwt.js";
import { sendVerificationEmail, sendResetPasswordEmail, sendOAuthReminderEmail, sendResetConfirmationEmail } from "../utils/email.js";
import { ensureUserHasUsername } from "../utils/usernameGenerator.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";

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
    const { email, password } = req.body;

    // 1. Validate inputs
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!password || !isPasswordStrong(password)) {
      return res.status(400).json({ error: "Password needs 8+ chars, one uppercase, one number, one special character." });
    }

    // 2. Check duplicate email
    const duplicateEmail = await User.findOne({ email: normalizedEmail });
    if (duplicateEmail) {
      if (!duplicateEmail.isVerified && duplicateEmail.provider === 'local') {
        // User already started signup but hasn't verified: update password & resend verification email
        duplicateEmail.passwordHash = password; // pre-save will hash
        const verifyToken = crypto.randomBytes(32).toString("hex");
        duplicateEmail.verifyToken = verifyToken;
        duplicateEmail.verifyTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await duplicateEmail.save();

        try {
          await sendVerificationEmail(normalizedEmail, verifyToken);
        } catch (err) {
          console.error("Error resending verification email:", err.message);
        }

        return res.status(200).json({ message: "Verification email resent! Please check your inbox." });
      }

      return res.status(400).json({ error: "An account with this email already exists. Try logging in." });
    }

    // 3. Create verification token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // 4. Create user (password hash handled in pre-save hook)
    const user = new User({
      email: normalizedEmail,
      passwordHash: password,
      isVerified: false,
      verifyToken,
      verifyTokenExpiry,
      provider: "local",
    });
    await user.save();

    // 5. Send verification email
    try {
      await sendVerificationEmail(normalizedEmail, verifyToken);
    } catch (err) {
      console.error("Error sending verification email:", err.message);
    }

    return res.status(201).json({ message: "Account created. Please verify your email." });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Please enter your email address." });
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const user = await User.findOne({ email: normalizedEmail, provider: "local" });

    if (!user) {
      return res.status(200).json({ message: "If an unverified account exists, a verification link has been resent." });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "This account is already verified. Please log in." });
    }

    const verifyToken = crypto.randomBytes(32).toString("hex");
    user.verifyToken = verifyToken;
    user.verifyTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    try {
      await sendVerificationEmail(normalizedEmail, verifyToken);
    } catch (err) {
      console.error("Error resending verification email:", err.message);
    }

    return res.status(200).json({ message: "Verification email resent! Please check your inbox." });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Incorrect email or password." });
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    // Find user (include select fields for passwordHash and verifyToken)
    let user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
    if (!user) {
      return res.status(404).json({ error: "No account found with this email address. Please sign up first." });
    }

    if (user.provider !== "local" || !user.passwordHash) {
      return res.status(400).json({
        error: `An account with this email exists via ${user.provider === 'google' ? 'Google' : user.provider}. Please sign in using that method.`
      });
    }

    // Check locking
    if (user.isLocked) {
      return res.status(423).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
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

    // Password correct: activate unverified local account on valid credentials
    if (!user.isVerified) {
      user.isVerified = true;
      user.verifyToken = undefined;
      user.verifyTokenExpiry = undefined;
    }

    // Reset lock & attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Ensure unique username exists for first login
    let usernameGenerated = false;
    if (!user.username) {
      const usernameResult = await ensureUserHasUsername(user);
      user = usernameResult.user;
      usernameGenerated = usernameResult.generated;
    }

    // Sign tokens
    const accessToken = signAccessToken(user._id, user.tokenVersion || 0);
    const refreshToken = signRefreshToken(user._id, user.tokenVersion || 0);

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
      usernameGenerated,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    let userIdToRevoke = null;

    if (refreshToken) {
      try {
        const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (decodedRefresh?.userId) {
          userIdToRevoke = decodedRefresh.userId;
        }
      } catch (e) {
        // expired or invalid refresh token
      }
    }

    if (!userIdToRevoke && req.headers.authorization?.startsWith('Bearer ')) {
      try {
        const decodedAccess = jwt.decode(req.headers.authorization.split(' ')[1]);
        if (decodedAccess?.userId) {
          userIdToRevoke = decodedAccess.userId;
        }
      } catch (e) {
        // ignore
      }
    }

    if (userIdToRevoke) {
      await User.findByIdAndUpdate(userIdToRevoke, { $inc: { tokenVersion: 1 } });
    }
  } catch (err) {
    console.error("Logout session revocation error:", err);
  }

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

    return res.status(200).json({
      message: "Verification passed! Please log in.",
      email: user.email,
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

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    // Generic public message strictly identical across registered, unregistered, and OAuth-only accounts
    const genericSuccessMsg = "If an account is associated with that email, a password reset link has been sent.";

    // Look up account by email without filtering provider so we can handle OAuth vs Local safely
    const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");

    if (!user) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[PASSWORD RESET] Non-existent email requested: "${normalizedEmail}"`);
      }
      return res.status(200).json({ message: genericSuccessMsg });
    }

    // Handle OAuth-only accounts (Google / GitHub) that lack a local password
    const isOAuthOnly =
      (user.provider === "google" || user.provider === "github" || user.googleId || user.githubId) &&
      !user.passwordHash;

    if (isOAuthOnly) {
      const provider = user.provider || (user.googleId ? "google" : "github");
      try {
        await sendOAuthReminderEmail(user.email, provider);
      } catch (mailErr) {
        console.error("Forgot password OAuth reminder mail error:", mailErr.message);
      }
      return res.status(200).json({ message: genericSuccessMsg });
    }

    // Local password account:
    // 1. Generate cryptographically secure 32-byte raw token
    const rawToken = crypto.randomBytes(32).toString("hex");

    // 2. Hash raw token with SHA-256 before database storage (never store raw token in MongoDB)
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 3. Set 30-minute expiration window
    const resetExpiry = Date.now() + 30 * 60 * 1000;

    user.resetToken = hashedToken;
    user.resetTokenExpiry = resetExpiry;
    await user.save();

    // 4. Send reset email containing ONLY the raw token in the reset link
    try {
      const emailResult = await sendResetPasswordEmail(user.email, rawToken);
      if (emailResult && emailResult.success === false && emailResult.reason !== "no_api_key") {
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();
      }
    } catch (mailErr) {
      console.error("Forgot password reset mail error:", mailErr.message);
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();
    }

    return res.status(200).json({ message: genericSuccessMsg });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    const genericInvalidMsg = "This password reset link is invalid or has expired. Please request a new one.";

    // 1. Validate token format (must be 64 hex characters)
    if (!token || typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ error: genericInvalidMsg });
    }

    // 2. Validate passwords
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    if (!password || !isPasswordStrong(password)) {
      return res.status(400).json({ error: "Password needs 8+ chars, one uppercase, one number, one special character." });
    }

    // 3. Hash incoming raw token using SHA-256 to look up matching record
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() },
    }).select("+passwordHash");

    if (!user) {
      return res.status(400).json({ error: genericInvalidMsg });
    }

    // 4. Ensure new password !== old password
    if (user.passwordHash) {
      const match = await user.comparePassword(password);
      if (match) {
        return res.status(400).json({ error: "New password cannot be the same as your old password." });
      }
    }

    // 5. Hash new password with bcrypt (work factor 12)
    const hashedPassword = await bcrypt.hash(password, 12);

    // 6. Atomic single-use update and consumption:
    // Guarantees one valid token can reset password only once;
    // Two concurrent submissions cannot both consume the token;
    // Revokes existing sessions by incrementing tokenVersion.
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        resetToken: hashedToken,
        resetTokenExpiry: { $gt: Date.now() },
      },
      {
        $set: { passwordHash: hashedPassword, isVerified: true },
        $unset: { resetToken: 1, resetTokenExpiry: 1, verifyToken: 1, verifyTokenExpiry: 1 },
        $inc: { tokenVersion: 1 },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ error: genericInvalidMsg });
    }

    // 7. Revoke existing refresh token cookie
    res.clearCookie("refreshToken", getCookieOptions());

    // 8. Send password change confirmation notification
    try {
      await sendResetConfirmationEmail(updatedUser.email);
    } catch (mailErr) {
      console.error("Confirmation mail error:", mailErr.message);
    }

    return res.status(200).json({ message: "Your password has been reset successfully. Please sign in with your new password." });
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

    if (user.tokenVersion !== undefined && decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: "Session has been revoked. Please log in again." });
    }

    const accessToken = signAccessToken(user._id, user.tokenVersion || 0);
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

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const {
      displayName,
      bio,
      role,
      skills,
      phone,
      location,
      website,
      socials,
      education,
      avatarUrl
    } = req.body;

    if (displayName !== undefined) user.displayName = String(displayName).trim();
    if (bio !== undefined) user.bio = String(bio).trim();
    if (role !== undefined) user.role = String(role).trim();
    if (skills !== undefined && Array.isArray(skills)) {
      user.skills = skills.map(s => String(s).trim()).filter(Boolean);
    }
    if (phone !== undefined) user.phone = String(phone).trim();
    if (location !== undefined) user.location = String(location).trim();
    if (website !== undefined) user.website = String(website).trim();
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    if (socials && typeof socials === 'object') {
      user.socials = {
        github: socials.github !== undefined ? String(socials.github).trim() : (user.socials?.github || ''),
        linkedin: socials.linkedin !== undefined ? String(socials.linkedin).trim() : (user.socials?.linkedin || ''),
        twitter: socials.twitter !== undefined ? String(socials.twitter).trim() : (user.socials?.twitter || ''),
        website: socials.website !== undefined ? String(socials.website).trim() : (user.socials?.website || ''),
      };
    }

    if (education !== undefined && Array.isArray(education)) {
      user.education = education.map(e => ({
        institution: e.institution ? String(e.institution).trim() : '',
        degree: e.degree ? String(e.degree).trim() : '',
        fieldOfStudy: e.fieldOfStudy ? String(e.fieldOfStudy).trim() : '',
        startYear: e.startYear ? String(e.startYear).trim() : '',
        endYear: e.endYear ? String(e.endYear).trim() : '',
      })).filter(e => e.institution || e.degree);
    }

    await user.save();
    return res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'devonestack/avatars',
      resource_type: 'image',
      type: 'upload',
      access_mode: 'public',
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
    });

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.avatarUrl = result.secure_url;
    await user.save();

    return res.json({
      message: "Avatar updated successfully",
      avatarUrl: result.secure_url,
      user
    });
  } catch (err) {
    console.error("uploadAvatar error:", err);
    return res.status(500).json({ error: "Failed to upload avatar" });
  }
};