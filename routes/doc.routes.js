import express from 'express';
import * as ctrl from '../controllers/doc.controller.js';
import protect from '../middleware/protectRoute.js';
import upload from '../config/multer.js';

import Doc from '../models/Doc.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',                  ctrl.listDocs);
router.post('/url',              ctrl.addUrlDoc);
router.post('/upload',           upload.single('file'), ctrl.uploadDoc);
router.get('/search',            ctrl.searchDocs);
router.get('/:docId/file', protect, ctrl.getDocFile);
router.patch('/:docId/pin',      togglePin(Doc));
router.patch('/:docId',          ctrl.updateDoc);
router.delete('/:docId',         ctrl.deleteDoc);

export default router;
