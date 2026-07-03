import jwt from "jsonwebtoken";

export const signAccessToken = (userId) =>
    jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "15m" });

export const signRefreshToken = (userId) =>
    jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

export const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};