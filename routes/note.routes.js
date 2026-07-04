import express from 'express';
import * as ctrl from '../controllers/note.controller.js';
import protect from '../middleware/protectRoute.js';

import Note from '../models/Note.js';
import { togglePin } from '../utils/pinSync.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/',               ctrl.listNotes);
router.post('/',              ctrl.createNote);
router.get('/search',         ctrl.searchNotes);
router.get('/:noteId/content',ctrl.getNoteContent);
router.patch('/:noteId/pin',  togglePin(Note));
router.patch('/:noteId',      ctrl.updateNote);
router.patch('/:noteId/content', ctrl.updateNoteContent);
router.delete('/:noteId',     ctrl.deleteNote);

export default router;
