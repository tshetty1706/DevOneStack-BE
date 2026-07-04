import Snippet from '../models/Snippet.js';
import SnippetContent from '../models/SnippetContent.js';
import Space from '../models/Space.js';
import History from '../models/History.js';
import DOMPurify from 'isomorphic-dompurify';
import { syncPinnedItem } from '../utils/pinSync.js';

// GET /api/spaces/:spaceId/snippets
export const listSnippets = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const snippets = await Snippet.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ snippets, hasMore: snippets.length === 20 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load snippets' });
  }
};

// POST /api/spaces/:spaceId/snippets
export const createSnippet = async (req, res) => {
  try {
    const { name, caption, language, code = '', tags = [] } = req.body;
    const { spaceId } = req.params;

    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const lines     = code.split('\n');
    const preview   = lines.slice(0, 3).join('\n');
    const lineCount = lines.length;

    const snippet = await Snippet.create({
      owner: req.user._id,
      spaceId,
      name: name.trim(),
      caption: caption?.trim(),
      language: language.trim(),
      preview,
      lineCount,
      tags: tags.map(t => t.trim().toLowerCase()),
    });

    await SnippetContent.create({ snippetId: snippet._id, code });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { snippetsCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_snippet',
      label: `Created snippet "${snippet.name}"`,
      meta: { spaceId, snippetId: snippet._id }
    });

    res.status(201).json({ snippet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/snippets/:id/content
export const getSnippetContent = async (req, res) => {
  try {
    const snippet = await Snippet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!snippet) return res.status(404).json({ error: 'Snippet not found' });

    const content = await SnippetContent.findOne({ snippetId: snippet._id });
    res.json({ code: content ? content.code : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/snippets/:id
export const updateSnippet = async (req, res) => {
  try {
    const { name, caption, language, tags, isPinned } = req.body;
    const update = {};
    if (name !== undefined)     update.name = name.trim();
    if (caption !== undefined)  update.caption = caption.trim();
    if (language !== undefined) update.language = language.trim();
    if (tags !== undefined)     update.tags = tags.map(t => t.trim().toLowerCase());
    if (isPinned !== undefined) update.isPinned = isPinned;

    const snippet = await Snippet.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      update,
      { new: true }
    );
    if (!snippet) return res.status(404).json({ error: 'Snippet not found' });

    if (isPinned !== undefined) {
      const content = await SnippetContent.findOne({ snippetId: snippet._id });
      const codeText = content ? content.code : '';
      await syncPinnedItem(req.user._id, snippet.spaceId, snippet._id, snippet.language, snippet.isPinned, {
        name: snippet.name,
        code: codeText,
        language: snippet.language,
        tags: snippet.tags
      });
    }

    res.json({ snippet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/snippets/:id/content
export const updateSnippetContent = async (req, res) => {
  try {
    const { code } = req.body;
    const snippet = await Snippet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!snippet) return res.status(404).json({ error: 'Snippet not found' });

    const lines     = code.split('\n');
    const preview   = lines.slice(0, 3).join('\n');
    const lineCount = lines.length;

    await Promise.all([
      SnippetContent.findOneAndUpdate(
        { snippetId: snippet._id },
        { code },
        { upsert: true }
      ),
      Snippet.findOneAndUpdate(
        { _id: snippet._id, owner: req.user._id },
        { preview, lineCount, updatedAt: new Date() }
      )
    ]);

    if (snippet.isPinned) {
      await syncPinnedItem(req.user._id, snippet.spaceId, snippet._id, snippet.language, true, {
        name: snippet.name,
        code: code,
        language: snippet.language,
        tags: snippet.tags
      });
    }

    res.json({ message: 'Saved', preview, lineCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/spaces/:spaceId/snippets/:id/use
export const useSnippet = async (req, res) => {
  try {
    await Snippet.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $inc: { usedCount: 1 }, $set: { lastUsed: new Date() } }
    );
    res.json({ message: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/spaces/:spaceId/snippets/:id
export const deleteSnippet = async (req, res) => {
  try {
    const snippet = await Snippet.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });
    if (!snippet) return res.status(404).json({ error: 'Not found' });

    // Sync pin removal
    await syncPinnedItem(req.user._id, snippet.spaceId, snippet._id, snippet.language, false);

    await SnippetContent.deleteOne({ snippetId: snippet._id });
    await Space.findOneAndUpdate(
      { _id: snippet.spaceId, owner: req.user._id, snippetsCount: { $gt: 0 } },
      { $inc: { snippetsCount: -1 } }
    );

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/snippets/search?q=
export const searchSnippets = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const snippets = await Snippet.find({
      spaceId,
      owner: req.user._id,
      $or: [
        { name:     { $regex: q, $options: 'i' } },
        { caption:  { $regex: q, $options: 'i' } },
        { language: { $regex: q, $options: 'i' } },
        { tags:     { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ snippets, count: snippets.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
