import express from 'express';
import * as ctrl from '../controllers/snippet.controller.js';
import protect from '../middleware/protectRoute.js';

import Snippet from '../models/Snippet.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',                  ctrl.listSnippets);
router.post('/',                 ctrl.createSnippet);
router.get('/search',            ctrl.searchSnippets);
router.get('/:id/content',       ctrl.getSnippetContent);
router.patch('/:id/pin',         togglePin(Snippet));
router.patch('/:id',             ctrl.updateSnippet);
router.patch('/:id/content',     ctrl.updateSnippetContent);
router.post('/:id/use',          ctrl.useSnippet);
router.delete('/:id',            ctrl.deleteSnippet);

export default router;
