import express from 'express';
import * as ctrl from '../controllers/folder.controller.js';
import protect from '../middleware/protectRoute.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', ctrl.listFolders);
router.post('/', ctrl.createFolder);
router.patch('/:folderId', ctrl.updateFolder);
router.delete('/:folderId', ctrl.deleteFolder);

export default router;
