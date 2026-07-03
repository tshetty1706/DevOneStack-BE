import express from "express";
import {
  getInboxItems,
  createInboxItem,
  updateInboxItem,
  deleteInboxItem,
} from "../controllers/inbox.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

// Apply protectRoute to all endpoints automatically
router.use(protectRoute);

router.get("/", getInboxItems);
router.post("/", createInboxItem);
router.put("/:id", updateInboxItem);
router.delete("/:id", deleteInboxItem);

export default router;
