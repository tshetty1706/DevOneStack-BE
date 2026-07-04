import express from 'express';
import * as ctrl from '../controllers/community.controller.js';
import protect from '../middleware/protectRoute.js';

import Community from '../models/Community.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',       ctrl.listCommunities);
router.post('/',      ctrl.createCommunity);
router.get('/search', ctrl.searchCommunities);
router.patch('/:id/pin', togglePin(Community));
router.patch('/:id',  ctrl.updateCommunity);
router.delete('/:id', ctrl.deleteCommunity);

export default router;
