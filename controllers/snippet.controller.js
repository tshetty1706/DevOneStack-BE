import Item from '../models/Item.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

// GET /api/spaces/:spaceId/snippets
export const listSnippets = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id, type: 'snippet' };
    if (lastId) filter._id = { $gt: lastId };
    if (tag) filter.tags = tag.toLowerCase().trim();

    const items = await Item.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .limit(50)
      .lean();

    const snippets = items.map(i => ({
      _id: i._id,
      name: i.title,
      title: i.title,
      caption: i.caption,
      language: i.language,
      preview: i.preview || i.content?.slice(0, 150),
      code: i.content,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ snippets, hasMore: items.length === 50 });
  } catch (err) {
    sendError(res, err, 'Failed to load snippets');
  }
};

// POST /api/spaces/:spaceId/snippets
export const createSnippet = async (req, res) => {
  try {
    const { name, title, caption, language = 'javascript', code = '', tags = [], folderId } = req.body;
    const { spaceId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const snippetTitle = (title || name || '').trim();
    if (!snippetTitle) return res.status(400).json({ error: 'Snippet name is required' });

    const preview = code.split('\n').slice(0, 3).join('\n');

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: folderId || null,
      title: snippetTitle,
      type: 'snippet',
      content: code,
      language: language.trim(),
      caption: caption?.trim() || '',
      preview,
      tags: parseTags(tags),
    });

    await updateSpaceResourceCount(spaceId, 'snippetsCount', 1);

    await logUserHistory(
      req.user._id,
      'created_snippet',
      `Created snippet "${item.title}"`,
      { spaceId, snippetId: item._id }
    );

    res.status(201).json({
      snippet: {
        _id: item._id,
        name: item.title,
        title: item.title,
        caption: item.caption,
        language: item.language,
        preview: item.preview,
        code: item.content,
        tags: item.tags,
        isPinned: item.isPinned,
        folderId: item.folderId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/snippets/:id/content
export const getSnippetContent = async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, owner: req.user._id, type: 'snippet' });
    if (!item) return res.status(404).json({ error: 'Snippet not found' });

    res.json({ code: item.content || '' });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/snippets/:id
export const updateSnippet = async (req, res) => {
  try {
    const { name, title, caption, language, code, tags, folderId } = req.body;
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'snippet' });
    if (!item) return res.status(404).json({ error: 'Snippet not found' });

    if (name || title) item.title = (title || name).trim();
    if (caption !== undefined) item.caption = caption.trim();
    if (language !== undefined) item.language = language.trim();
    if (code !== undefined) {
      item.content = code;
      item.preview = code.split('\n').slice(0, 3).join('\n');
    }
    if (tags !== undefined) item.tags = parseTags(tags);
    if (folderId !== undefined) item.folderId = (folderId && folderId !== 'root') ? folderId : null;

    await item.save();

    res.json({
      snippet: {
        _id: item._id,
        name: item.title,
        title: item.title,
        caption: item.caption,
        language: item.language,
        preview: item.preview,
        code: item.content,
        tags: item.tags,
        isPinned: item.isPinned,
        folderId: item.folderId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    });
  } catch (err) {
    sendError(res, err);
  }
};

// DELETE /api/spaces/:spaceId/snippets/:id
export const deleteSnippet = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOneAndDelete({ _id: id, spaceId, owner: req.user._id, type: 'snippet' });
    if (!item) return res.status(404).json({ error: 'Snippet not found' });

    await updateSpaceResourceCount(spaceId, 'snippetsCount', -1);

    res.json({ message: 'Snippet deleted' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/snippets/search?q=
export const searchSnippets = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const items = await Item.find({
      spaceId,
      owner: req.user._id,
      type: 'snippet',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ]
    }).limit(20).lean();

    const snippets = items.map(i => ({
      _id: i._id,
      name: i.title,
      title: i.title,
      caption: i.caption,
      language: i.language,
      preview: i.preview || i.content?.slice(0, 150),
      code: i.content,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ snippets, count: snippets.length });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/snippets/:id/content
export const updateSnippetContent = async (req, res) => {
  try {
    const { code } = req.body;
    const { spaceId, id } = req.params;

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'snippet' });
    if (!item) return res.status(404).json({ error: 'Snippet not found' });

    item.content = code || '';
    item.preview = (code || '').split('\n').slice(0, 3).join('\n');
    await item.save();

    res.json({ message: 'Snippet content updated' });
  } catch (err) {
    sendError(res, err);
  }
};

// POST /api/spaces/:spaceId/snippets/:id/use
export const useSnippet = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Item.findOne({ _id: id, owner: req.user._id, type: 'snippet' });
    if (!item) return res.status(404).json({ error: 'Snippet not found' });

    res.json({ message: 'Used snippet recorded' });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/snippets/:id/pin
export const togglePin = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'snippet' });
    if (!item) return res.status(404).json({ error: 'Snippet not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err);
  }
};

