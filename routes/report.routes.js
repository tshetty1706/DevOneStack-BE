import express from "express";
import { createReport, blockUser, unblockUser } from "../controllers/report.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.use(protectRoute);

router.post("/", createReport);
router.post("/block/:userId", blockUser);
router.post("/unblock/:userId", unblockUser);

export default router;
