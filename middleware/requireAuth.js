import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
    const token = req.cookies.accessToken;
    if (!token) return res.status(401).json({ message: "Not authenticated" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: "Token expired or invalid" });
    }
};