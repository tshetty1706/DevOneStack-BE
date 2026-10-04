import express from "express";
import {
  getFeed,
  getDiscoverSpaces,
  createPost,
  uploadPostImage,
  updatePost,
  deletePost,
  toggleLikePost,
  getPostComments,
  createPostComment,
  deletePostComment,
  followUser,
  unfollowUser,
  getUserFollowers,
  getUserFollowing,
  getPublicProfile,
  searchCommunity,
  getMyPosts,
  getUserContributions
} from "../controllers/community.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { postLimiter, commentLimiter, followLimiter } from "../middleware/rateLimiter.js";
import upload from "../config/multer.js";

import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

// Safe optional authentication middleware (never blocks guest browsing)
const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }
    if (token && token !== "undefined" && token !== "null") {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.userId) {
        const user = await User.findById(decoded.userId)
          .select("-passwordHash -verifyToken -resetToken -verifyTokenExpiry -resetTokenExpiry")
          .lean();
        if (user) req.user = user;
      }
    }
  } catch (err) {
    // If token expired/invalid, seamlessly proceed as guest without 401 error
    req.user = null;
  }
  next();
};

// Publicly readable endpoints (guests can browse Discover / Public Profiles / Search)
router.get("/feed", optionalAuth, getFeed);
router.get("/discover-spaces", optionalAuth, getDiscoverSpaces);
router.get("/search", optionalAuth, searchCommunity);
router.get("/profile/:username", optionalAuth, getPublicProfile);
router.get("/contributions/:username", optionalAuth, getUserContributions);
router.get("/posts/:id/comments", getPostComments);
router.get("/users/:username/followers", optionalAuth, getUserFollowers);
router.get("/users/:username/following", optionalAuth, getUserFollowing);

// User Community Posts
router.get("/my-posts", protectRoute, getMyPosts);

// Protected actions
router.post("/upload-image", protectRoute, upload.single("image"), uploadPostImage);
router.post("/posts", protectRoute, postLimiter, upload.single("image"), createPost);
router.patch("/posts/:id", protectRoute, updatePost);
router.delete("/posts/:id", protectRoute, deletePost);
router.post("/posts/:id/like", protectRoute, toggleLikePost);
router.post("/posts/:id/comments", protectRoute, commentLimiter, createPostComment);
router.delete("/comments/:id", protectRoute, deletePostComment);

router.post("/follow/:userId", protectRoute, followLimiter, followUser);
router.post("/unfollow/:userId", protectRoute, unfollowUser);

export default router;
