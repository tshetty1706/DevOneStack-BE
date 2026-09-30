import express from 'express';
import * as ctrl from '../controllers/item.controller.js';
import protect from '../middleware/protectRoute.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', ctrl.listItems);
router.post('/', ctrl.createItem);
router.get('/:itemId', ctrl.getItem);
router.patch('/:itemId/pin', ctrl.togglePinItem);
router.patch('/:itemId', ctrl.updateItem);
router.delete('/:itemId', ctrl.deleteItem);

export default router;
