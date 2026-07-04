import express from 'express';
import * as ctrl from '../controllers/prompt.controller.js';
import protect from '../middleware/protectRoute.js';

import Prompt from '../models/Prompt.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',       ctrl.listPrompts);
router.post('/',      ctrl.createPrompt);
router.get('/search', ctrl.searchPrompts);
router.patch('/:id/pin', togglePin(Prompt));
router.patch('/:id',  ctrl.updatePrompt);
router.post('/:id/use', ctrl.usePrompt);
router.delete('/:id', ctrl.deletePrompt);

export default router;
