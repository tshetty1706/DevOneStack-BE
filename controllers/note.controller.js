import Note from '../models/Note.js';
import NoteContent from '../models/NoteContent.js';
import Space from '../models/Space.js';
import History from '../models/History.js';
import DOMPurify from 'isomorphic-dompurify';
import { syncPinnedItem } from '../utils/pinSync.js';

const stripMarkdown = (md) =>
  md.replace(/[#*`>\[\]_~]/g, '').replace(/\n+/g, ' ').trim();

// GET /api/spaces/:spaceId/notes
export const listNotes = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const notes = await Note.find(filter)
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ notes, hasMore: notes.length === 20 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notes' });
  }
};

// POST /api/spaces/:spaceId/notes
export const createNote = async (req, res) => {
  try {
    const { title, body = '', tags = [] } = req.body;
    const { spaceId } = req.params;

    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const cleanBody = DOMPurify.sanitize(body);
    const preview   = stripMarkdown(cleanBody).slice(0, 200);
    const wordCount = cleanBody.split(/\s+/).filter(Boolean).length;

    const note = await Note.create({
      owner: req.user._id,
      spaceId,
      title: title.trim(),
      preview,
      wordCount,
      tags: tags.map(t => t.trim().toLowerCase()),
    });

    await NoteContent.create({ noteId: note._id, body: cleanBody });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { notesCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_note',
      label: `Created note "${note.title}"`,
      meta: { spaceId, noteId: note._id }
    });

    res.status(201).json({ note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/notes/:noteId/content
export const getNoteContent = async (req, res) => {
  try {
    const { noteId } = req.params;
    const note = await Note.findOne({ _id: noteId, owner: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const content = await NoteContent.findOne({ noteId });
    res.json({ body: content ? content.body : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/notes/:noteId
export const updateNote = async (req, res) => {
  try {
    const { title, tags, isPinned } = req.body;
    const { noteId } = req.params;

    const update = {};
    if (title !== undefined) update.title = title.trim();
    if (tags !== undefined)   update.tags = tags.map(t => t.trim().toLowerCase());
    if (isPinned !== undefined) update.isPinned = isPinned;

    const note = await Note.findOneAndUpdate(
      { _id: noteId, owner: req.user._id },
      update,
      { new: true }
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });

    if (isPinned !== undefined) {
      const content = await NoteContent.findOne({ noteId: note._id });
      const bodyText = content ? content.body : '';
      await syncPinnedItem(req.user._id, note.spaceId, note._id, 'markdown', note.isPinned, {
        name: note.title,
        code: bodyText,
        language: 'markdown',
        tags: note.tags
      });
    }

    res.json({ note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/notes/:noteId/content
export const updateNoteContent = async (req, res) => {
  try {
    const { body } = req.body;
    const { noteId } = req.params;

    const note = await Note.findOne({ _id: noteId, owner: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const cleanBody = DOMPurify.sanitize(body);
    const preview   = stripMarkdown(cleanBody).slice(0, 200);
    const wordCount = cleanBody.split(/\s+/).filter(Boolean).length;

    await Promise.all([
      NoteContent.findOneAndUpdate(
        { noteId },
        { body: cleanBody, lastEditedAt: new Date() },
        { upsert: true }
      ),
      Note.findOneAndUpdate(
        { _id: noteId, owner: req.user._id },
        { preview, wordCount, updatedAt: new Date() }
      )
    ]);

    if (note.isPinned) {
      await syncPinnedItem(req.user._id, note.spaceId, note._id, 'markdown', true, {
        name: note.title,
        code: cleanBody,
        language: 'markdown',
        tags: note.tags
      });
    }

    res.json({ message: 'Saved', preview, wordCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/spaces/:spaceId/notes/:noteId
export const deleteNote = async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.noteId,
      owner: req.user._id
    });
    if (!note) return res.status(404).json({ error: 'Not found' });

    // Sync pin removal
    await syncPinnedItem(req.user._id, note.spaceId, note._id, 'markdown', false);

    await NoteContent.deleteOne({ noteId: note._id });
    await Space.findOneAndUpdate(
      { _id: note.spaceId, owner: req.user._id, notesCount: { $gt: 0 } },
      { $inc: { notesCount: -1 } }
    );

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/notes/search?q=
export const searchNotes = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const notes = await Note.find({
      spaceId,
      owner: req.user._id,
      $or: [
        { title:   { $regex: q, $options: 'i' } },
        { preview: { $regex: q, $options: 'i' } },
        { tags:    { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ notes, count: notes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
