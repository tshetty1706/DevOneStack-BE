import express from 'express';
import { getAllPinned } from '../controllers/dashboard.controller.js';
import protectRoute from '../middleware/protectRoute.js';

const router = express.Router();

router.use(protectRoute);

router.get('/pinned', getAllPinned);

export default router;
