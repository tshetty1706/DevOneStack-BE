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
  getPublicProfile
} from "../controllers/community.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { postLimiter, commentLimiter, followLimiter } from "../middleware/rateLimiter.js";
import upload from "../config/multer.js";

const router = express.Router();

// Publicly readable endpoints (guests can browse Discover / Public Profiles)
router.get("/feed", (req, res, next) => {
  // Optional auth
  const token = req.headers.authorization;
  if (token) return protectRoute(req, res, next);
  next();
}, getFeed);

router.get("/discover-spaces", getDiscoverSpaces);
router.get("/profile/:username", (req, res, next) => {
  const token = req.headers.authorization;
  if (token) return protectRoute(req, res, next);
  next();
}, getPublicProfile);

router.get("/posts/:id/comments", getPostComments);
router.get("/users/:username/followers", (req, res, next) => {
  const token = req.headers.authorization;
  if (token) return protectRoute(req, res, next);
  next();
}, getUserFollowers);

router.get("/users/:username/following", (req, res, next) => {
  const token = req.headers.authorization;
  if (token) return protectRoute(req, res, next);
  next();
}, getUserFollowing);

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
