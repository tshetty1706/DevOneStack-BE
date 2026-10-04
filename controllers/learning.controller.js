import Item from '../models/Item.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

// GET /api/spaces/:spaceId/learnings
export const listLearnings = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { type, tag } = req.query;

    const filter = { spaceId, owner: req.user._id, type: 'learning' };
    if (type && type !== 'all') filter.learningType = type;
    if (tag) filter.tags = tag.toLowerCase().trim();

    const items = await Item.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();

    const learnings = items.map(i => ({
      _id: i._id,
      title: i.title,
      type: i.learningType || 'learning',
      content: i.content,
      codeExample: i.codeExample || { language: '', code: '' },
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ learnings });
  } catch (err) {
    sendError(res, err, 'Failed to load learnings');
  }
};

// GET /api/spaces/:spaceId/learnings/search?q=
export const searchLearnings = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const items = await Item.find({
      spaceId,
      owner: req.user._id,
      type: 'learning',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ]
    }).limit(20).lean();

    const learnings = items.map(i => ({
      _id: i._id,
      title: i.title,
      type: i.learningType || 'learning',
      content: i.content,
      codeExample: i.codeExample || { language: '', code: '' },
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ learnings, count: learnings.length });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/learnings/:learningId
export const getLearning = async (req, res) => {
  try {
    const { spaceId, learningId } = req.params;
    const item = await Item.findOne({ _id: learningId, spaceId, owner: req.user._id, type: 'learning' });
    if (!item) return res.status(404).json({ error: 'Learning not found' });

    res.json({
      learning: {
        _id: item._id,
        title: item.title,
        type: item.learningType || 'learning',
        content: item.content,
        codeExample: item.codeExample || { language: '', code: '' },
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

// POST /api/spaces/:spaceId/learnings
export const createLearning = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { title, type = 'learning', content, codeExample, tags, folderId } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: folderId || null,
      title: title.trim(),
      type: 'learning',
      learningType: type,
      content: content.trim(),
      codeExample: codeExample || { language: '', code: '' },
      tags: parseTags(tags),
      isPinned: false
    });

    await updateSpaceResourceCount(spaceId, 'learningsCount', 1);

    await logUserHistory(
      req.user._id,
      'created_learning',
      `Created ${item.learningType} "${item.title}"`,
      { spaceId, learningId: item._id }
    );

    res.status(201).json({
      learning: {
        _id: item._id,
        title: item.title,
        type: item.learningType,
        content: item.content,
        codeExample: item.codeExample,
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

// PATCH /api/spaces/:spaceId/learnings/:learningId
export const updateLearning = async (req, res) => {
  try {
    const { spaceId, learningId } = req.params;
    const { title, type, content, codeExample, tags, folderId } = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: learningId, spaceId, owner: req.user._id, type: 'learning' });
    if (!item) return res.status(404).json({ error: 'Learning not found' });

    if (title !== undefined) item.title = title.trim();
    if (type !== undefined) item.learningType = type;
    if (content !== undefined) item.content = content.trim();
    if (codeExample !== undefined) item.codeExample = codeExample;
    if (tags !== undefined) item.tags = parseTags(tags);
    if (folderId !== undefined) item.folderId = (folderId && folderId !== 'root') ? folderId : null;

    await item.save();

    res.json({
      learning: {
        _id: item._id,
        title: item.title,
        type: item.learningType,
        content: item.content,
        codeExample: item.codeExample,
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

// DELETE /api/spaces/:spaceId/learnings/:learningId
export const deleteLearning = async (req, res) => {
  try {
    const { spaceId, learningId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOneAndDelete({ _id: learningId, spaceId, owner: req.user._id, type: 'learning' });
    if (!item) return res.status(404).json({ error: 'Learning not found' });

    await updateSpaceResourceCount(spaceId, 'learningsCount', -1);

    res.json({ message: 'Learning deleted' });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/learnings/:learningId/pin
export const togglePin = async (req, res) => {
  try {
    const { spaceId, learningId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: learningId, spaceId, owner: req.user._id, type: 'learning' });
    if (!item) return res.status(404).json({ error: 'Learning not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err);
  }
};
