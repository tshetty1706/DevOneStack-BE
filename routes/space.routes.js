import express from "express";
import {
  getSpaces,
  getSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  recountSpace,
} from "../controllers/space.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

// Apply protectRoute to all space endpoints automatically
router.use(protectRoute);

router.get("/", getSpaces);
router.patch("/:spaceId/recount", recountSpace);
router.get("/:id", getSpace);
router.post("/", createSpace);
router.patch("/:id", updateSpace);
router.delete("/:id", deleteSpace);

export default router;
