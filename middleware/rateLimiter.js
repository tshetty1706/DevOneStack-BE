import rateLimit from "express-rate-limit";

const isProd = process.env.NODE_ENV === "production";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 10 : 100, // 10 attempts in prod, 100 in dev
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProd ? 5 : 100, // 5 per hour in prod, 100 in dev
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProd ? 3 : 50, // 3 per hour in prod, 50 in dev
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Community Post rate limiter (5/hour in prod, 50 in dev)
export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 5 : 50,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: "Post limit reached (5 posts/hour). Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Comment rate limiter (20/hour in prod, 100 in dev)
export const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 20 : 100,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: "Comment limit reached (20 comments/hour). Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Follow rate limiter (100/day)
export const followLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: isProd ? 100 : 500,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: "Daily follow limit reached (100 follows/day)." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Clone operation rate limiter (10/day)
export const cloneLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: isProd ? 10 : 100,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: "Daily clone limit reached (10 clones/day)." },
  standardHeaders: true,
  legacyHeaders: false,
});