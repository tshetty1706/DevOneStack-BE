import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import connectDB from "./config/db.js";
import passport from "./config/passport.js";
import authRoutes from "./routes/auth.routes.js";
import inboxRoutes from "./routes/inbox.routes.js";
import boilerplateRoutes from "./routes/boilerplate.routes.js";
import spaceRoutes from "./routes/space.routes.js";
import historyRoutes from "./routes/history.routes.js";
import docRoutes from "./routes/doc.routes.js";
import learningRoutes from "./routes/learning.routes.js";
import snippetRoutes from "./routes/snippet.routes.js";
import repoRoutes from "./routes/repo.routes.js";
import promptRoutes from "./routes/prompt.routes.js";
import communityRoutes from "./routes/community.routes.js";
import tagRoutes from "./routes/tag.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import folderRoutes from "./routes/folder.routes.js";
import itemRoutes from "./routes/item.routes.js";
import cloneRoutes from "./routes/clone.routes.js";
import collaborationRoutes from "./routes/collaboration.routes.js";
import reportRoutes from "./routes/report.routes.js";
import Space from "./models/Space.js";
import path from "path";

// Connect to MongoDB Atlas and perform migration
connectDB().then(async () => {
  try {
    // Migration: ensure any legacy unlisted spaces become private
    const result = await Space.updateMany({ visibility: 'unlisted' }, { $set: { visibility: 'private' } });
    if (result.modifiedCount > 0) {
      console.log(`🔒 Migrated ${result.modifiedCount} legacy 'unlisted' spaces to 'private'.`);
    }
  } catch (migErr) {
    console.warn("Visibility migration notice:", migErr.message);
  }
});

const app = express();

// Secure headers with cross-origin iframe support for document previews
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: [
        "'self'",
        process.env.CLIENT_URL || "http://localhost:5173",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "*"
      ],
    },
  },
}));

app.use(express.json());
app.use(cookieParser());
// Static file serving for locally stored uploads (PDFs and documents)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://devonestack.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);


app.use(passport.initialize());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/clone", cloneRoutes);
app.use("/api/collaborators", collaborationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/boilerplates", boilerplateRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/pinned", dashboardRoutes);

// Specific space sub-resources mounted first
app.use("/api/spaces/:spaceId/folders", folderRoutes);
app.use("/api/spaces/:spaceId/items", itemRoutes);
app.use("/api/spaces/:spaceId/docs", docRoutes);
app.use("/api/spaces/:spaceId/learnings", learningRoutes);
app.use("/api/spaces/:spaceId/snippets", snippetRoutes);
app.use("/api/spaces/:spaceId/repos", repoRoutes);
app.use("/api/spaces/:spaceId/prompts", promptRoutes);
app.use("/api/spaces/:spaceId/communities", communityRoutes);
app.use("/api/spaces/:spaceId/tags", tagRoutes);

// Base space CRUD operations
app.use("/api/spaces", spaceRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: "File too large. Maximum allowed size is 50MB." });
  }
  if (err.message && (err.message.includes('images') || err.message.includes('PDF'))) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message || "Something went wrong on our end. Try again shortly." });
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