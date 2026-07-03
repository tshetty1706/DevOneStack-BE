import express from "express";
import {
  getBoilerplates,
  createBoilerplate,
  updateBoilerplate,
  deleteBoilerplate,
} from "../controllers/boilerplate.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

// Apply protectRoute to all endpoints automatically
router.use(protectRoute);

router.get("/", getBoilerplates);
router.post("/", createBoilerplate);
router.put("/:id", updateBoilerplate);
router.delete("/:id", deleteBoilerplate);

export default router;
