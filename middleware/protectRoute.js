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

  req.user = user;
  next();
};