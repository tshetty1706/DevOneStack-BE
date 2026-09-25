import Learning from '../models/Learning.js';
import { syncPinnedItem } from '../utils/pinSync.js';
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

    const filter = { spaceId, owner: req.user._id };
    if (type && type !== 'all') filter.type = type;
    if (tag) filter.tags = tag.toLowerCase().trim();

    const learnings = await Learning.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .select('-__v');

    res.json({ learnings });
  } catch (err) {
    sendError(res, err, 'Failed to load learnings');
  }
};

// GET /api/spaces/:spaceId/learnings/:learningId
export const getLearning = async (req, res) => {
  try {
    const { learningId } = req.params;
    const learning = await Learning.findOne({ _id: learningId, owner: req.user._id });
    if (!learning) return res.status(404).json({ error: 'Learning not found' });
    res.json({ learning });
  } catch (err) {
    sendError(res, err);
  }
};

// POST /api/spaces/:spaceId/learnings
export const createLearning = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { title, type, content, codeExample, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const learning = await Learning.create({
      owner: req.user._id,
      spaceId,
      title: title.trim(),
      type: type || 'learning',
      content: content.trim(),
      codeExample: codeExample || { language: '', code: '' },
      tags: parseTags(tags),
      isPinned: false
    });

    await updateSpaceResourceCount(spaceId, 'learningsCount', 1);

    await logUserHistory(
      req.user._id,
      'created_learning',
      `Created ${learning.type} "${learning.title}"`,
      { spaceId, learningId: learning._id }
    );

    res.status(201).json({ learning });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/learnings/:learningId
export const updateLearning = async (req, res) => {
  try {
    const { learningId } = req.params;
    const { title, type, content, codeExample, tags, isPinned } = req.body;

    const learning = await Learning.findOne({ _id: learningId, owner: req.user._id });
    if (!learning) return res.status(404).json({ error: 'Learning not found' });

    const oldPinned = learning.isPinned;

    if (title !== undefined) learning.title = title.trim();
    if (type !== undefined) learning.type = type;
    if (content !== undefined) learning.content = content.trim();
    if (codeExample !== undefined) learning.codeExample = codeExample;
    if (tags !== undefined) learning.tags = parseTags(tags);
    if (isPinned !== undefined) learning.isPinned = isPinned;

    await learning.save();

    // Pin synchronization if state changed
    if (isPinned !== undefined && oldPinned !== isPinned) {
      await syncPinnedItem(req.user._id, learning.spaceId, learning._id, 'learning', isPinned);
      
      await logUserHistory(
        req.user._id,
        isPinned ? 'pinned_learning' : 'unpinned_learning',
        `${isPinned ? 'Pinned' : 'Unpinned'} learning "${learning.title}"`,
        { spaceId: learning.spaceId, learningId: learning._id }
      );
    } else {
      await logUserHistory(
        req.user._id,
        'updated_learning',
        `Updated learning "${learning.title}"`,
        { spaceId: learning.spaceId, learningId: learning._id }
      );
    }

    res.json({ learning });
  } catch (err) {
    sendError(res, err);
  }
};

// DELETE /api/spaces/:spaceId/learnings/:learningId
export const deleteLearning = async (req, res) => {
  try {
    const { spaceId, learningId } = req.params;

    const learning = await Learning.findOneAndDelete({ _id: learningId, owner: req.user._id });
    if (!learning) return res.status(404).json({ error: 'Learning not found' });

    // Sync pin removal
    await syncPinnedItem(req.user._id, spaceId, learning._id, 'learning', false);
    await updateSpaceResourceCount(spaceId, 'learningsCount', -1);

    await logUserHistory(
      req.user._id,
      'deleted_learning',
      `Deleted learning "${learning.title}"`,
      { spaceId }
    );

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/learnings/search?q=
export const searchLearnings = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { q } = req.query;

    if (!q) {
      const learnings = await Learning.find({ spaceId, owner: req.user._id }).sort({ updatedAt: -1 });
      return res.json({ learnings, count: learnings.length });
    }

    const queryRegex = new RegExp(q, 'i');
    const learnings = await Learning.find({
      spaceId,
      owner: req.user._id,
      $or: [
        { title: queryRegex },
        { content: queryRegex },
        { tags: queryRegex }
      ]
    }).sort({ updatedAt: -1 });

    res.json({ learnings, count: learnings.length });
  } catch (err) {
    sendError(res, err);
  }
};
