import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import passport from "./config/passport.js";
import authRoutes from "./routes/auth.js";

dotenv.config();

// Connect to MongoDB Atlas before starting the server
connectDB();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
    cors({
        origin: process.env.CLIENT_URL,  // e.g. http://localhost:5173
        credentials: true,               // required so cookies are sent cross-origin
    })
);
app.use(passport.initialize());          // session: false — JWT handles sessions

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));