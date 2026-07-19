import Space from "../models/Space.js";
import History from "../models/History.js";
import Learning from "../models/Learning.js";
import Snippet from "../models/Snippet.js";
import SnippetContent from "../models/SnippetContent.js";
import Doc from "../models/Doc.js";
import Repo from "../models/Repo.js";
import Prompt from "../models/Prompt.js";
import Community from "../models/Community.js";
import deleteFromCloudinary from "../utils/deleteFromCloudinary.js";
import { getIconKeyByName } from "../utils/iconMapping.js";

export const getSpaces = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const spaces = await Space.find({ owner: ownerId }).sort({ isPinned: -1, updatedAt: -1 });
    return res.json(spaces);
  } catch (err) {
    console.error("getSpaces error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const getSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const space = await Space.findOne({ _id: id, owner: req.user._id });
    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }
    return res.json(space);
  } catch (err) {
    console.error("getSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const createSpace = async (req, res) => {
  try {
    const { name, tags, iconKey } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Space name is required" });
    }

    // Determine icon and iconKey based on request body or name
    const finalIconKey = iconKey || getIconKeyByName(name);

    // Parse tags if it's a comma-separated string
    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags;
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    const space = await Space.create({
      owner: req.user._id,
      name,
      icon: finalIconKey, // legacy support
      iconKey: finalIconKey,
      tags: parsedTags,
      progress: 0,
      docsCount: 0,
      learningsCount: 0,
      snippetsCount: 0,
      reposCount: 0,
      promptsCount: 0,
      communitiesCount: 0
    });

    // Log to history
    await History.create({
      owner: req.user._id,
      action: 'created_space',
      label: `Created space "${name}"`,
      meta: { spaceId: space._id, spaceName: name, tags: parsedTags },
    });

    return res.status(201).json(space);
  } catch (err) {
    console.error("createSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

// PATCH /api/spaces/:id
export const updateSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tags, iconKey, isPinned } = req.body;
    const update = {};
    if (name !== undefined) {
      update.name = name.trim();
    }
    if (isPinned !== undefined) {
      update.isPinned = isPinned;
    }

    if (iconKey !== undefined) {
      update.iconKey = iconKey;
      update.icon = iconKey; // legacy support
    } else if (name !== undefined) {
      const autoIconKey = getIconKeyByName(name);
      update.iconKey = autoIconKey;
      update.icon = autoIconKey;
    }

    if (tags !== undefined) {
      update.tags = Array.isArray(tags) ? tags.map(t => t.trim().toLowerCase()) : [];
    }

    const space = await Space.findOneAndUpdate(
      { _id: id, owner: req.user._id },
      update,
      { new: true, runValidators: true }
    );

    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    return res.json(space);
  } catch (err) {
    console.error("updateSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

// DELETE /api/spaces/:id
export const deleteSpace = async (req, res) => {
  try {
    const { id: spaceId } = req.params;
    const owner = req.user._id;

    const space = await Space.findOneAndDelete({ _id: spaceId, owner });
    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    // Get IDs for content-split collections
    const [snippets, docs] = await Promise.all([
      Snippet.find({ spaceId }).select('_id'),
      Doc.find({ spaceId, cloudinaryPublicId: { $exists: true } }).select('cloudinaryPublicId type'),
    ]);

    // Delete everything in parallel
    await Promise.all([
      Learning.deleteMany({ spaceId }),
      Snippet.deleteMany({ spaceId }),
      SnippetContent.deleteMany({ snippetId: { $in: snippets.map(s => s._id) } }),
      Doc.deleteMany({ spaceId }),
      Repo.deleteMany({ spaceId }),
      Prompt.deleteMany({ spaceId }),
      Community.deleteMany({ spaceId }),
      History.deleteMany({ 'meta.spaceId': spaceId }),
    ]);

    // Delete Cloudinary files for this space (after DB cleanup)
    await Promise.allSettled(
      docs.map(doc =>
        deleteFromCloudinary(
          doc.cloudinaryPublicId,
          doc.type === 'pdf' ? 'raw' : 'image'
        )
      )
    );

    return res.json({ message: "Space deleted successfully" });
  } catch (err) {
    console.error("deleteSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

// PATCH /api/spaces/:spaceId/recount
export const recountSpace = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const owner = req.user._id;

    const space = await Space.findOne({ _id: spaceId, owner });
    if (!space) return res.status(404).json({ error: 'Not found' });

    const [docsCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount] =
      await Promise.all([
        Doc.countDocuments({ spaceId, owner }),
        Learning.countDocuments({ spaceId, owner }),
        Snippet.countDocuments({ spaceId, owner }),
        Repo.countDocuments({ spaceId, owner }),
        Prompt.countDocuments({ spaceId, owner }),
        Community.countDocuments({ spaceId, owner }),
      ]);

    const updated = await Space.findOneAndUpdate(
      { _id: spaceId, owner },
      { 
        $set: { 
          docsCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount,
          updatedAt: new Date()
        } 
      },
      { new: true }
    );

    return res.json({
      message: 'Counts repaired',
      counts: { docsCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount }
    });
  } catch (err) {
    console.error("recountSpace error:", err);
    return res.status(500).json({ error: err.message });
  }
};
