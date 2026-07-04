import express from "express";
import {
  getSpaces,
  getSpace,
  createSpace,
} from "../controllers/space.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

// Apply protectRoute to all space endpoints automatically
router.use(protectRoute);

router.get("/", getSpaces);
router.get("/:id", getSpace);
router.post("/", createSpace);

export default router;
