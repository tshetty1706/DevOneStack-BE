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
} from "../controllers/space.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import upload from "../config/multer.js";

const router = express.Router();

// Apply protectRoute to all space endpoints automatically
router.use(protectRoute);

router.get("/", getSpaces);
router.post("/upload-thumbnail", upload.single("thumbnail"), uploadSpaceThumbnail);
router.patch("/:spaceId/recount", recountSpace);
router.get("/:id", getSpace);
router.post("/", createSpace);
router.patch("/:id", updateSpace);
router.post("/:id/star", toggleStarSpace);
router.delete("/:id", deleteSpace);

export default router;

