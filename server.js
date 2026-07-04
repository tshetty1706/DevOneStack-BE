import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import helmet from "helmet";
import connectDB from "./config/db.js";
import passport from "./config/passport.js";
import authRoutes from "./routes/auth.routes.js";
import inboxRoutes from "./routes/inbox.routes.js";
import boilerplateRoutes from "./routes/boilerplate.routes.js";
import spaceRoutes from "./routes/space.routes.js";
import historyRoutes from "./routes/history.routes.js";

dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// Secure headers
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows cross-origin image loads in dev
}));

app.use(express.json());
app.use(cookieParser());

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
    })
);

app.use(passport.initialize());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/boilerplates", boilerplateRoutes);
app.use("/api/spaces", spaceRoutes);
app.use("/api/history", historyRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
});

const getPort = () => {
  if (process.env.PORT) return process.env.PORT;
  if (process.env.SERVER_URL) {
    try {
      return new URL(process.env.SERVER_URL).port || 9000;
    } catch (e) {
      // Ignored
    }
  }
  return 9000;
};

const PORT = getPort();
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));