import express from "express";
import {
  getInboxItems,
  getUnreadCounts,
  markTabAsRead,
  handleCloneRequestAction,
  handleCollaborationInviteAction
} from "../controllers/inbox.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.use(protectRoute);

router.get("/unread-count", getUnreadCounts);
router.get("/", getInboxItems);
router.get("/items", getInboxItems);
router.post("/mark-read", markTabAsRead);
router.post("/requests/:id/action", handleCloneRequestAction);
router.post("/invitations/:id/action", handleCollaborationInviteAction);

export default router;
