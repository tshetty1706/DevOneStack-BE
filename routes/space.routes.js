import express from "express";
import {
  getSpaces,
  getSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  recountSpace,
  toggleStarSpace,
  uploadSpaceThumbnail,
  toggleRequestLink,
  regenerateRequestLink,
} from "../controllers/space.controller.js";
import {
  getCollaborators,
  inviteCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
} from "../controllers/collaboration.controller.js";
import protectRoute, { optionalProtectRoute } from "../middleware/protectRoute.js";
import upload from "../config/multer.js";

const router = express.Router();

router.get("/", protectRoute, getSpaces);
router.post("/upload-thumbnail", protectRoute, upload.single("thumbnail"), uploadSpaceThumbnail);
router.patch("/:spaceId/recount", protectRoute, recountSpace);

// Request link settings
router.post("/:spaceId/request-link", protectRoute, toggleRequestLink);
router.post("/:spaceId/request-link/regenerate", protectRoute, regenerateRequestLink);

// Space Collaborator Sub-routes
router.get("/:spaceId/collaborators", protectRoute, getCollaborators);
router.post("/:spaceId/collaborators/invite", protectRoute, inviteCollaborator);
router.patch("/:spaceId/collaborators/:userId", protectRoute, updateCollaboratorRole);
router.delete("/:spaceId/collaborators/:userId", protectRoute, removeCollaborator);

router.get("/:id", optionalProtectRoute, getSpace);
router.post("/", protectRoute, createSpace);
router.patch("/:id", protectRoute, updateSpace);
router.post("/:id/star", protectRoute, toggleStarSpace);
router.delete("/:id", protectRoute, deleteSpace);

export default router;

