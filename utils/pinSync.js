import Boilerplate from '../models/Boilerplate.js';
import Space from '../models/Space.js';

export const syncPinnedItem = async (userId, spaceId, itemId, itemType, isPinned, details) => {
  try {
    if (isPinned) {
      const space = await Space.findById(spaceId);
      const stackName = space ? space.name : 'Unknown';

      const existing = await Boilerplate.findOne({ owner: userId, linkedItemId: itemId });
      if (!existing) {
        await Boilerplate.create({
          owner: userId,
          name: details.name || 'Untitled',
          code: details.code || '',
          language: details.language || itemType,
          stack: stackName,
          tags: details.tags || [],
          isPinned: true,
          linkedItemId: itemId
        });
      } else {
        await Boilerplate.findOneAndUpdate(
          { owner: userId, linkedItemId: itemId },
          {
            name: details.name || 'Untitled',
            code: details.code || '',
            language: details.language || itemType,
            stack: stackName,
            tags: details.tags || [],
            isPinned: true
          }
        );
      }
    } else {
      await Boilerplate.deleteOne({ owner: userId, linkedItemId: itemId });
    }
  } catch (err) {
    console.error("pinSync error:", err);
  }
};

export const togglePin = (Model) => async (req, res) => {
  try {
    const itemId = req.params.id || req.params.noteId || req.params.docId;
    const item = await Model.findOne({ _id: itemId, owner: req.user._id });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const updated = await Model.findOneAndUpdate(
      { _id: itemId, owner: req.user._id },
      { $set: { isPinned: !item.isPinned } },
      { new: true }
    );

    return res.json({ isPinned: updated.isPinned, item: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
