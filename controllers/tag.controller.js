import mongoose from 'mongoose';
import Note from '../models/Note.js';
import Snippet from '../models/Snippet.js';
import Doc from '../models/Doc.js';
import Repo from '../models/Repo.js';
import Prompt from '../models/Prompt.js';
import Community from '../models/Community.js';

const { ObjectId } = mongoose.Types;

// GET /api/spaces/:spaceId/tags
export const getAllTags = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const owner = req.user._id;

    // CRITICAL: convert spaceId string to ObjectId before aggregation
    const spaceObjectId = new mongoose.Types.ObjectId(spaceId);
    const ownerObjectId = new mongoose.Types.ObjectId(owner);

    const collections = [
      { model: Note,      name: 'notes' },
      { model: Snippet,   name: 'snippets' },
      { model: Doc,       name: 'docs' },
      { model: Repo,      name: 'repos' },
      { model: Prompt,    name: 'prompts' },
      { model: Community, name: 'communities' },
    ];

    const tagMaps = await Promise.all(
      collections.map(({ model, name }) =>
        model.aggregate([
          { $match: { spaceId: spaceObjectId, owner: ownerObjectId } },
          { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $project: { tag: '$_id', count: 1, _id: 0 } }
        ])
      )
    );

    // Merge across all collections
    const merged = {};
    tagMaps.forEach((results, i) => {
      const sourceName = collections[i].name;
      results.forEach(({ tag, count }) => {
        if (!tag || tag.trim() === '') return; // skip empty tags
        // normalize tag to lower-case but keep formatting if needed (let's keep lowercase clean)
        const cleanTag = tag.trim().toLowerCase();
        if (!merged[cleanTag]) merged[cleanTag] = { tag: cleanTag, count: 0, sources: [] };
        merged[cleanTag].count += count;
        if (!merged[cleanTag].sources.includes(sourceName)) {
          merged[cleanTag].sources.push(sourceName);
        }
      });
    });

    const tags = Object.values(merged)
      .filter(t => t.tag && t.count > 0)
      .sort((a, b) => b.count - a.count);

    // Also get total unique tags count
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
    const owner = req.user._id;

    const spaceObjectId = new mongoose.Types.ObjectId(spaceId);
    const ownerObjectId = new mongoose.Types.ObjectId(owner);

    // Case-insensitive tag search
    const tagRegex = new RegExp(`^${tag}$`, 'i');
    const filter = {
      spaceId: spaceObjectId,
      owner: ownerObjectId,
      tags: tagRegex
    };

    const [docs, notes, snippets, repos, prompts, communities] = await Promise.all([
      Doc.find(filter).select('title type url caption tags cloudinaryUrl isPinned createdAt').limit(20),
      Note.find(filter).select('title preview tags isPinned wordCount updatedAt').limit(20),
      Snippet.find(filter).select('name caption language preview tags isPinned').limit(20),
      Repo.find(filter).select('name url caption platform tags isPinned').limit(20),
      Prompt.find(filter).select('title body caption model tags isPinned usedCount').limit(20),
      Community.find(filter).select('name url platform caption tags isPinned').limit(20),
    ]);

    const total = docs.length + notes.length + snippets.length +
                  repos.length + prompts.length + communities.length;

    res.json({ docs, notes, snippets, repos, prompts, communities, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/tags/rename
export const renameTag = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { oldTag, newTag } = req.body;
    const owner = req.user._id;

    if (!oldTag || !newTag) {
      return res.status(400).json({ error: 'oldTag and newTag are required' });
    }

    const cleanOld = oldTag.trim().toLowerCase();
    const cleanNew = newTag.trim().toLowerCase();

    const filter = { spaceId: new ObjectId(spaceId), owner, tags: cleanOld };
    const update = { $set: { 'tags.$': cleanNew } };

    await Promise.all([
      Note.updateMany(filter, update),
      Snippet.updateMany(filter, update),
      Doc.updateMany(filter, update),
      Repo.updateMany(filter, update),
      Prompt.updateMany(filter, update),
      Community.updateMany(filter, update),
    ]);

    res.json({ message: `Renamed "${oldTag}" to "${newTag}" across all content` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/spaces/:spaceId/tags/:tag
export const deleteTag = async (req, res) => {
  try {
    const { spaceId, tag } = req.params;
    const owner = req.user._id;
    const cleanTag = tag.trim().toLowerCase();

    const filter = { spaceId: new ObjectId(spaceId), owner, tags: cleanTag };
    const update = { $pull: { tags: cleanTag } };

    await Promise.all([
      Note.updateMany(filter, update),
      Snippet.updateMany(filter, update),
      Doc.updateMany(filter, update),
      Repo.updateMany(filter, update),
      Prompt.updateMany(filter, update),
      Community.updateMany(filter, update),
    ]);

    res.json({ message: `Removed tag "${tag}" from all content` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
