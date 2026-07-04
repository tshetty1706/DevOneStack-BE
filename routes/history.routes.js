import express from "express";
import { getHistory } from "../controllers/history.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();
router.use(protectRoute);
router.get("/", getHistory);

export default router;
