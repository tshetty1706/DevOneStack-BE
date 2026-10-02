import mongoose from 'mongoose';
import Item from '../models/Item.js';
import Space from '../models/Space.js';

// GET /api/spaces/:spaceId/tags
export const getAllTags = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const spaceObjectId = new mongoose.Types.ObjectId(spaceId);

    const tagAggregation = await Item.aggregate([
      { $match: { spaceId: spaceObjectId } },
      { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: { $toLower: '$tags' },
          count: { $sum: 1 },
          types: { $addToSet: '$type' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const tags = tagAggregation
      .filter(t => t._id && t._id.trim() !== '')
      .map(t => ({
        tag: t._id,
        count: t.count,
        sources: t.types || [],
      }));

    res.json({ tags, total: tags.length });
  } catch (err) {
    console.error('Tags aggregation error:', err);
    res.status(500).json({ error: err.message, tags: [] });
  }
};

// GET /api/spaces/:spaceId/tags/:tag/content
export const getTagContent = async (req, res) => {
  try {
    const { spaceId, tag } = req.params;
    const spaceObjectId = new mongoose.Types.ObjectId(spaceId);

    const tagRegex = new RegExp(`^${tag}$`, 'i');
    const items = await Item.find({
      spaceId: spaceObjectId,
      tags: tagRegex
    })
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();

    const docs = items.filter(i => i.type === 'doc' || i.type === 'image');
    const learnings = items.filter(i => i.type === 'learning');
    const snippets = items.filter(i => i.type === 'snippet');
    const repos = items.filter(i => i.type === 'repo');
    const prompts = items.filter(i => i.type === 'prompt');
    const communities = items.filter(i => i.type === 'community');
    const notes = items.filter(i => i.type === 'note');

    res.json({
      items,
      docs,
      learnings,
      snippets,
      repos,
      prompts,
      communities,
      notes,
      total: items.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/tags/rename
export const renameTag = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { oldTag, newTag } = req.body;

    if (!oldTag || !newTag) {
      return res.status(400).json({ error: 'oldTag and newTag are required' });
    }

    const cleanOld = oldTag.trim().toLowerCase();
    const cleanNew = newTag.trim().toLowerCase();

    await Item.updateMany(
      { spaceId, tags: cleanOld },
      { $set: { 'tags.$[elem]': cleanNew } },
      { arrayFilters: [{ elem: cleanOld }] }
    );

    res.json({ message: `Renamed #${cleanOld} to #${cleanNew}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/spaces/:spaceId/tags/:tag
export const deleteTag = async (req, res) => {
  try {
    const { spaceId, tag } = req.params;
    const cleanTag = tag.trim().toLowerCase();

    await Item.updateMany(
      { spaceId, tags: cleanTag },
      { $pull: { tags: cleanTag } }
    );

    res.json({ message: `Removed tag #${cleanTag}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
