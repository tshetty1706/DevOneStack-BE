import express from 'express';
import * as ctrl from '../controllers/item.controller.js';
import protect from '../middleware/protectRoute.js';
import upload from '../config/multer.js';

const router = express.Router({ mergeParams: true });

// Direct file access for <iframe>, <img>, and downloads
router.get('/:itemId/file', ctrl.getItemFile);

router.use(protect);

router.get('/', ctrl.listItems);
router.post('/', ctrl.createItem);
router.post('/upload', upload.single('file'), ctrl.uploadItem);
router.get('/:itemId', ctrl.getItem);
router.patch('/:itemId/pin', ctrl.togglePinItem);
router.patch('/:itemId', ctrl.updateItem);
router.delete('/:itemId', ctrl.deleteItem);

export default router;
