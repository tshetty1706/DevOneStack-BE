import express from 'express';
import * as ctrl from '../controllers/repo.controller.js';
import protect from '../middleware/protectRoute.js';

import Repo from '../models/Repo.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',       ctrl.listRepos);
router.post('/',      ctrl.createRepo);
router.get('/search', ctrl.searchRepos);
router.patch('/:id/pin', togglePin(Repo));
router.patch('/:id',  ctrl.updateRepo);
router.delete('/:id', ctrl.deleteRepo);

export default router;
