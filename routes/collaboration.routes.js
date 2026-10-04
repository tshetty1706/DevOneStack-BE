import express from "express";
import {
  getCollaborators,
  inviteCollaborator,
  removeCollaborator,
  updateCollaboratorRole
} from "../controllers/collaboration.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.use(protectRoute);

router.get("/:spaceId", getCollaborators);
router.post("/invite", inviteCollaborator);
router.delete("/:spaceId/:collaboratorUserId", removeCollaborator);
router.patch("/:spaceId/:collaboratorUserId", updateCollaboratorRole);

export default router;
