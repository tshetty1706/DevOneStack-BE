import Item from '../models/Item.js';

// GET /api/dashboard/pinned
export const getAllPinned = async (req, res) => {
  try {
    const owner = req.user._id;

    const pinnedItems = await Item.find({ owner, isPinned: true })
      .populate('spaceId', 'name iconKey color isArchived')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const learnings = pinnedItems.filter(i => i.type === 'learning');
    const snippets = pinnedItems.filter(i => i.type === 'snippet');
    const docs = pinnedItems.filter(i => i.type === 'doc' || i.type === 'image');
    const repos = pinnedItems.filter(i => i.type === 'repo');
    const prompts = pinnedItems.filter(i => i.type === 'prompt');
    const communities = pinnedItems.filter(i => i.type === 'community');
    const notes = pinnedItems.filter(i => i.type === 'note');

    res.json({
      items: pinnedItems,
      learnings,
      snippets,
      docs,
      repos,
      prompts,
      communities,
      notes,
      total: pinnedItems.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
