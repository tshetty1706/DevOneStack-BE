import Item from '../models/Item.js';
import DOMPurify from 'isomorphic-dompurify';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

// GET /api/spaces/:spaceId/prompts
export const listPrompts = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id, type: 'prompt' };
    if (lastId) filter._id = { $gt: lastId };
    if (tag) filter.tags = tag.toLowerCase().trim();

    const items = await Item.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .limit(50)
      .lean();

    const prompts = items.map(i => ({
      _id: i._id,
      title: i.title,
      body: i.content,
      content: i.content,
      caption: i.caption,
      model: i.model,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ prompts, hasMore: items.length === 50 });
  } catch (err) {
    sendError(res, err, 'Failed to load prompts');
  }
};

// POST /api/spaces/:spaceId/prompts
export const createPrompt = async (req, res) => {
  try {
    const { title, body, content, caption, tags = [], model, folderId } = req.body;
    const { spaceId } = req.params;

    const promptText = (body || content || '').trim();
    if (!promptText) return res.status(400).json({ error: 'Prompt body is required' });

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const cleanBody = DOMPurify.sanitize(promptText);

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: folderId || null,
      title: title ? title.trim() : 'Untitled Prompt',
      type: 'prompt',
      content: cleanBody,
      caption: caption?.trim() || '',
      model: model?.trim() || '',
      tags: parseTags(tags),
    });

    await updateSpaceResourceCount(spaceId, 'promptsCount', 1);

    await logUserHistory(
      req.user._id,
      'created_prompt',
      `Saved prompt "${item.title}"`,
      { spaceId, promptId: item._id }
    );

    res.status(201).json({
      prompt: {
        _id: item._id,
        title: item.title,
        body: item.content,
        content: item.content,
        caption: item.caption,
        model: item.model,
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

// PATCH /api/spaces/:spaceId/prompts/:id
export const updatePrompt = async (req, res) => {
  try {
    const { title, body, content, caption, tags, model, folderId } = req.body;
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'prompt' });
    if (!item) return res.status(404).json({ error: 'Prompt not found' });

    if (title !== undefined) item.title = title.trim();
    if (body !== undefined || content !== undefined) item.content = DOMPurify.sanitize(body || content);
    if (caption !== undefined) item.caption = caption.trim();
    if (tags !== undefined) item.tags = parseTags(tags);
    if (model !== undefined) item.model = model.trim();
    if (folderId !== undefined) item.folderId = (folderId && folderId !== 'root') ? folderId : null;

    await item.save();

    res.json({
      prompt: {
        _id: item._id,
        title: item.title,
        body: item.content,
        content: item.content,
        caption: item.caption,
        model: item.model,
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

// DELETE /api/spaces/:spaceId/prompts/:id
export const deletePrompt = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOneAndDelete({ _id: id, spaceId, owner: req.user._id, type: 'prompt' });
    if (!item) return res.status(404).json({ error: 'Prompt not found' });

    await updateSpaceResourceCount(spaceId, 'promptsCount', -1);

    res.json({ message: 'Prompt deleted' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/prompts/search?q=
export const searchPrompts = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const items = await Item.find({
      spaceId,
      owner: req.user._id,
      type: 'prompt',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { model: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ]
    }).limit(20).lean();

    const prompts = items.map(i => ({
      _id: i._id,
      title: i.title,
      body: i.content,
      content: i.content,
      caption: i.caption,
      model: i.model,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ prompts, count: prompts.length });
  } catch (err) {
    sendError(res, err);
  }
};

// POST /api/spaces/:spaceId/prompts/:id/use
export const usePrompt = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Item.findOne({ _id: id, owner: req.user._id, type: 'prompt' });
    if (!item) return res.status(404).json({ error: 'Prompt not found' });

    res.json({ message: 'Used prompt recorded' });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/prompts/:id/pin
export const togglePin = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'prompt' });
    if (!item) return res.status(404).json({ error: 'Prompt not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err);
  }
};

