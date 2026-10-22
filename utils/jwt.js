import jwt from "jsonwebtoken";

export const signAccessToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ userId, tokenVersion }, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" });
};

export const signRefreshToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ userId, tokenVersion }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" });
};
