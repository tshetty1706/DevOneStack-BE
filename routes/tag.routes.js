import express from 'express';
import * as ctrl from '../controllers/tag.controller.js';
import protect from '../middleware/protectRoute.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',                  ctrl.getAllTags);
router.patch('/rename',          ctrl.renameTag);
router.get('/:tag/content',      ctrl.getTagContent);
router.delete('/:tag',           ctrl.deleteTag);

export default router;
