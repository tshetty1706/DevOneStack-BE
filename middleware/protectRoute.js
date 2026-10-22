import jwt from "jsonwebtoken";
import User from "../models/User.js";

export default async (req, res, next) => {
  let token = null;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = await User.findById(decoded.userId)
    .select('-passwordHash -verifyToken -resetToken -verifyTokenExpiry -resetTokenExpiry')
    .lean();
  if (!user) {
    return res.status(401).json({ error: 'User no longer exists' });
  }

  if (user.tokenVersion !== undefined && decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
    return res.status(401).json({ error: 'Session revoked. Please log in again.' });
  }

  req.user = user;
  next();
};

export const optionalProtectRoute = async (req, res, next) => {
  let token = null;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId)
      .select('-passwordHash -verifyToken -resetToken -verifyTokenExpiry -resetTokenExpiry')
      .lean();

    if (user && (user.tokenVersion === undefined || decoded.tokenVersion === undefined || decoded.tokenVersion === user.tokenVersion)) {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (e) {
    req.user = null;
  }

  next();
};