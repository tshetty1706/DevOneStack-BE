import Learning from '../models/Learning.js';
import Space from '../models/Space.js';
import History from '../models/History.js';
import { syncPinnedItem } from '../utils/pinSync.js';

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
    res.status(500).json({ error: 'Failed to load learnings' });
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
    res.status(500).json({ error: err.message });
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

    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const cleanTags = Array.isArray(tags) 
      ? tags.map(t => t.trim().toLowerCase()).filter(Boolean) 
      : [];

    const learning = await Learning.create({
      owner: req.user._id,
      spaceId,
      title: title.trim(),
      type: type || 'learning',
      content: content.trim(),
      codeExample: codeExample || { language: '', code: '' },
      tags: cleanTags,
      isPinned: false
    });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { learningsCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_learning',
      label: `Created ${learning.type} "${learning.title}"`,
      meta: { spaceId, learningId: learning._id }
    });

    res.status(201).json({ learning });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (tags !== undefined) {
      learning.tags = Array.isArray(tags) 
        ? tags.map(t => t.trim().toLowerCase()).filter(Boolean) 
        : [];
    }
    if (isPinned !== undefined) learning.isPinned = isPinned;

    await learning.save();

    // Pin synchronization if state changed
    if (isPinned !== undefined && oldPinned !== isPinned) {
      await syncPinnedItem(req.user._id, learning.spaceId, learning._id, 'learning', isPinned);
      
      await History.create({
        owner: req.user._id,
        action: isPinned ? 'pinned_learning' : 'unpinned_learning',
        label: `${isPinned ? 'Pinned' : 'Unpinned'} learning "${learning.title}"`,
        meta: { spaceId: learning.spaceId, learningId: learning._id }
      });
    } else {
      await History.create({
        owner: req.user._id,
        action: 'updated_learning',
        label: `Updated learning "${learning.title}"`,
        meta: { spaceId: learning.spaceId, learningId: learning._id }
      });
    }

    res.json({ learning });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id, learningsCount: { $gt: 0 } },
      { $inc: { learningsCount: -1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'deleted_learning',
      label: `Deleted learning "${learning.title}"`,
      meta: { spaceId }
    });

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};
