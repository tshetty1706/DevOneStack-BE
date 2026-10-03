import express from "express";
import {
  clonePublicSpace,
  getSpaceRequestLinkInfo,
  createPrivateSpaceRequest,
  executeApprovedClone
} from "../controllers/clone.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { cloneLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Public request link landing info
router.get("/request-link/:token", getSpaceRequestLinkInfo);

// Protected clone operations
router.post("/public/:spaceId", protectRoute, cloneLimiter, clonePublicSpace);
router.post("/request", protectRoute, createPrivateSpaceRequest);
router.post("/execute/:requestId", protectRoute, cloneLimiter, executeApprovedClone);

export default router;
