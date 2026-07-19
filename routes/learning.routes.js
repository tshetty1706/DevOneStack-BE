import express from 'express';
import * as ctrl from '../controllers/learning.controller.js';
import protect from '../middleware/protectRoute.js';
import Learning from '../models/Learning.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',               ctrl.listLearnings);
router.post('/',              ctrl.createLearning);
router.get('/search',         ctrl.searchLearnings);
router.get('/:learningId',    ctrl.getLearning);
router.patch('/:learningId/pin', togglePin(Learning));
router.patch('/:learningId',  ctrl.updateLearning);
router.delete('/:learningId', ctrl.deleteLearning);

export default router;
