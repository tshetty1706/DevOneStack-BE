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

import Item from '../models/Item.js';

export const togglePin = (Model) => async (req, res) => {
  try {
    const itemId = req.params.id || req.params.learningId || req.params.noteId || req.params.docId || req.params.itemId;
    
    // Always check Item model first with strict user ownership
    let item = await Item.findOne({ _id: itemId, owner: req.user._id });
    if (!item && Model && Model !== Item) {
      item = await Model.findOne({ _id: itemId, owner: req.user._id });
    }
    if (!item) return res.status(404).json({ error: 'Item not found or unauthorized' });

    const newPinned = !item.isPinned;

    await Item.updateOne({ _id: itemId, owner: req.user._id }, { $set: { isPinned: newPinned } });
    if (Model && Model !== Item) {
      await Model.updateOne({ _id: itemId, owner: req.user._id }, { $set: { isPinned: newPinned } }).catch(() => {});
    }

    const updated = await Item.findOne({ _id: itemId, owner: req.user._id }).lean();
    return res.json({ isPinned: newPinned, item: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
