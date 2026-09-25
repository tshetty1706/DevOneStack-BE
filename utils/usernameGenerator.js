import crypto from "crypto";
import User from "../models/User.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const ALPHANUMERIC_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Generates a cryptographically secure random alphanumeric suffix (e.g. "7K4M", "X92P", "K7X4")
 * Guaranteed to contain both letters and numbers as commonly seen on developer platforms like LeetCode.
 *
 * @param {number} length - Length of suffix (default: 4)
 * @returns {string} - Random alphanumeric suffix
 */
export const generateRandomSuffix = (length = 4) => {
  const effectiveLen = Math.max(length, 4);

  // Pick at least 1 uppercase letter and 1 digit
  const guaranteedLetter = LETTERS[crypto.randomInt(0, LETTERS.length)];
  const guaranteedDigit = DIGITS[crypto.randomInt(0, DIGITS.length)];

  const chars = [guaranteedLetter, guaranteedDigit];

  // Fill remaining characters from alphanumeric pool (mix of uppercase, digits, lowercase)
  const POOL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 2; i < effectiveLen; i++) {
    chars.push(POOL[crypto.randomInt(0, POOL.length)]);
  }

  // Fisher-Yates shuffle with crypto
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};

/**
 * Extracts a clean, readable, normalized base prefix from user's display name or email,
 * removing trailing numbers, special characters, and personal identifying details.
 *
 * Examples:
 * - "trishashetty1706@gmail.com" -> "trishashetty"
 * - "trisha.shetty@company.com"  -> "trishashetty"
 * - "alex.doe@example.org"       -> "alexdoe" (or "alex")
 * - "john12345@gmail.com"        -> "john"
 * - "Developer" / empty          -> "dev"
 *
 * @param {object} user - User object containing email and/or displayName
 * @returns {string} - Sanitized base prefix (3-14 chars, lowercase, url-safe)
 */
export const getCleanBasePrefix = (user) => {
  let raw = "";

  if (user?.displayName && typeof user.displayName === "string") {
    const cleanDisplay = user.displayName.trim();
    if (cleanDisplay && cleanDisplay.toLowerCase() !== "developer" && cleanDisplay.length >= 2) {
      // Remove symbols and spaces
      raw = cleanDisplay.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    }
  }

  if (!raw && user?.email && typeof user.email === "string") {
    const emailPrefix = user.email.split("@")[0].toLowerCase();
    // Remove dots, hyphens, underscores
    const withoutSymbols = emailPrefix.replace(/[.+_-]/g, "");
    // Remove trailing numbers (e.g., trishashetty1706 -> trishashetty)
    const withoutTrailingNums = withoutSymbols.replace(/\d+$/, "");

    if (withoutTrailingNums && withoutTrailingNums.length >= 3) {
      raw = withoutTrailingNums;
    } else if (withoutSymbols && withoutSymbols.length >= 3) {
      raw = withoutSymbols;
    } else {
      raw = emailPrefix.replace(/[^a-z0-9]/g, "");
    }
  }

  let sanitized = (raw || "dev")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 14);

  if (!sanitized || sanitized.length < 3) {
    sanitized = sanitized ? `dev${sanitized}` : "devuser";
  }

  return sanitized;
};

/**
 * Generates a candidate username using READABLE BASE + RANDOM ALPHANUMERIC SUFFIX.
 * Examples:
 * - "trishashetty7K4M"
 * - "trishashettyX92P"
 * - "trishashetty8F2L"
 * - "trishaK7X4"
 * - "devtrisha4N8P"
 *
 * @param {string} basePrefix - Clean base prefix
 * @param {number} randomLength - Length of suffix
 * @returns {string} - Candidate username
 */
export const generateCandidateUsername = (basePrefix, randomLength = 4) => {
  const suffix = generateRandomSuffix(randomLength);
  return `${basePrefix}${suffix}`;
};

/**
 * Ensures the user has a unique random-character-based username.
 *
 * Rules:
 * 1. If user already has a valid username, returns { user, generated: false } (never overwrites or regenerates).
 * 2. If user has no username, generates a unique candidate with random characters.
 * 3. Atomically saves to database using findOneAndUpdate conditioned on username missing.
 * 4. Handles concurrent logins, race conditions, and MongoDB 11000 duplicate key errors safely with retries.
 * 5. Returns { user: updatedUser, generated: true }.
 *
 * @param {object} user - User document or object with _id
 * @returns {Promise<{ user: object, generated: boolean }>}
 */
export const ensureUserHasUsername = async (user) => {
  if (!user || !user._id) {
    throw new Error("Invalid user provided to ensureUserHasUsername");
  }

  // 1. If user already has a username, keep it and do not regenerate
  if (user.username && typeof user.username === "string" && user.username.trim().length > 0) {
    return { user, generated: false };
  }

  // Check fresh DB state
  const freshUser = await User.findById(user._id);
  if (!freshUser) {
    throw new Error("User not found in database");
  }

  if (freshUser.username && freshUser.username.trim().length > 0) {
    return { user: freshUser, generated: false };
  }

  const basePrefix = getCleanBasePrefix(freshUser);
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 4 alphanumeric characters initially (e.g. 7K4M), 5 if collision retries occur
    const randomLength = attempt < 5 ? 4 : 5;
    const candidate = generateCandidateUsername(basePrefix, randomLength);

    // Fast existence check
    const exists = await User.exists({ username: candidate });
    if (exists) {
      continue;
    }

    try {
      // Atomic findOneAndUpdate: sets username ONLY IF this user still doesn't have one
      const updated = await User.findOneAndUpdate(
        {
          _id: freshUser._id,
          $or: [
            { username: { $exists: false } },
            { username: null },
            { username: "" }
          ]
        },
        { $set: { username: candidate } },
        { new: true }
      );

      if (updated) {
        return { user: updated, generated: true };
      }

      // If updated is null, a concurrent request for this same user already assigned a username
      const concurrentUser = await User.findById(freshUser._id);
      if (concurrentUser && concurrentUser.username) {
        return { user: concurrentUser, generated: false };
      }
    } catch (err) {
      // MongoDB duplicate key error (code 11000)
      if (err.code === 11000 || (err.message && err.message.includes("E11000"))) {
        console.warn(`[Username Collision] Candidate "${candidate}" collided during atomic write, retrying with new random alphanumeric characters...`);
        continue;
      }
      throw err;
    }
  }

  // Fallback if all attempts collided: higher entropy random suffix
  const fallbackCandidate = `${basePrefix}${generateRandomSuffix(6)}`;
  const updatedFallback = await User.findOneAndUpdate(
    {
      _id: freshUser._id,
      $or: [
        { username: { $exists: false } },
        { username: null },
        { username: "" }
      ]
    },
    { $set: { username: fallbackCandidate } },
    { new: true }
  );

  if (updatedFallback) {
    return { user: updatedFallback, generated: true };
  }

  const finalCheck = await User.findById(freshUser._id);
  return { user: finalCheck, generated: false };
};
