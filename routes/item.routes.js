import express from 'express';
import * as ctrl from '../controllers/item.controller.js';
import protect, { optionalProtectRoute } from '../middleware/protectRoute.js';
import upload from '../config/multer.js';

const router = express.Router({ mergeParams: true });

// Direct file access for <iframe>, <img>, and downloads
router.get('/:itemId/file', ctrl.getItemFile);

// Read items: accessible if public space (guest/user) or if authorized for private space
router.get('/', optionalProtectRoute, ctrl.listItems);
router.get('/:itemId', optionalProtectRoute, ctrl.getItem);

// All mutations require authenticated user
router.post('/', protect, ctrl.createItem);
router.post('/upload', protect, upload.single('file'), ctrl.uploadItem);
router.patch('/:itemId/pin', protect, ctrl.togglePinItem);
router.patch('/:itemId', protect, ctrl.updateItem);
router.post('/:itemId/read', protect, ctrl.recordItemEngagement);
router.delete('/:itemId', protect, ctrl.deleteItem);

export default router;

