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
    const { tab, visibility } = req.query;

    let query = { owner: ownerId };

    if (tab === 'starred') {
      query = { starredBy: ownerId };
    } else if (tab === 'archived') {
      query = { owner: ownerId, isArchived: true };
    } else if (tab === 'shared') {
      query = { owner: { $ne: ownerId }, visibility: 'public' };
    } else if (tab === 'mine') {
      query = { owner: ownerId, isArchived: { $ne: true } };
    } else {
      // 'all' or default
      query = {
        $or: [
          { owner: ownerId },
          { starredBy: ownerId }
        ]
      };
    }

    if (visibility && ['public', 'private', 'unlisted'].includes(visibility)) {
      query.visibility = visibility;
    }

    const spaces = await Space.find(query)
      .populate('owner', 'username displayName avatarUrl')
      .sort({ isPinned: -1, updatedAt: -1 });

    return res.json(spaces);
  } catch (err) {
    console.error("getSpaces error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const getSpace = async (req, res) => {
  try {
    const { id } = req.params;
    // Allow viewing if owner, or if public/unlisted
    const space = await Space.findOne({
      _id: id,
      $or: [
        { owner: req.user._id },
        { visibility: { $in: ['public', 'unlisted'] } }
      ]
    }).populate('owner', 'username displayName avatarUrl');

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
    const { name, description, tool, thumbnail, visibility, tags, iconKey } = req.body;
    
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Space name is required" });
    }
    if (trimmedName.length > 80) {
      return res.status(400).json({ error: "Space name must be 80 characters or less" });
    }

    const trimmedDescription = (description || '').trim();
    if (trimmedDescription.length > 500) {
      return res.status(400).json({ error: "Description must be 500 characters or less" });
    }

    const validVisibilities = ['public', 'private', 'unlisted'];
    const finalVisibility = validVisibilities.includes(visibility) ? visibility : 'private';

    // Determine icon and iconKey based on request body or tool or name
    const finalIconKey = iconKey || getIconKeyByName(tool || trimmedName);

    // Parse tags if it's a comma-separated string or array
    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean);
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    const space = await Space.create({
      owner: req.user._id,
      name: trimmedName,
      description: trimmedDescription,
      tool: (tool || '').trim(),
      thumbnail: (thumbnail || '').trim(),
      visibility: finalVisibility,
      icon: finalIconKey, // legacy support
      iconKey: finalIconKey,
      tags: parsedTags,
      starsCount: 0,
      viewsCount: 0,
      sharesCount: 0,
      contributorsCount: 1,
      progress: 0,
      docsCount: 0,
      learningsCount: 0,
      snippetsCount: 0,
      reposCount: 0,
      promptsCount: 0,
      communitiesCount: 0
    });

    const populatedSpace = await Space.findById(space._id).populate('owner', 'username displayName avatarUrl');

    // Log to history
    await History.create({
      owner: req.user._id,
      action: 'created_space',
      label: `Created space "${trimmedName}"`,
      meta: { spaceId: space._id, spaceName: trimmedName, tags: parsedTags },
    });

    return res.status(201).json(populatedSpace);
  } catch (err) {
    console.error("createSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

// PATCH /api/spaces/:id
export const updateSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, tool, thumbnail, visibility, tags, iconKey, isPinned, isArchived } = req.body;
    const update = {};

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: "Space name cannot be empty" });
      update.name = trimmed;
    }
    if (description !== undefined) {
      update.description = description.trim();
    }
    if (tool !== undefined) {
      update.tool = tool.trim();
    }
    if (thumbnail !== undefined) {
      update.thumbnail = thumbnail.trim();
    }
    if (visibility !== undefined && ['public', 'private', 'unlisted'].includes(visibility)) {
      update.visibility = visibility;
    }
    if (isPinned !== undefined) {
      update.isPinned = Boolean(isPinned);
    }
    if (isArchived !== undefined) {
      update.isArchived = Boolean(isArchived);
    }

    if (iconKey !== undefined) {
      update.iconKey = iconKey;
      update.icon = iconKey; // legacy support
    } else if (name !== undefined || tool !== undefined) {
      const autoIconKey = getIconKeyByName(tool || name);
      update.iconKey = autoIconKey;
      update.icon = autoIconKey;
    }

    if (tags !== undefined) {
      update.tags = Array.isArray(tags) 
        ? tags.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean)
        : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    }

    const space = await Space.findOneAndUpdate(
      { _id: id, owner: req.user._id },
      update,
      { new: true, runValidators: true }
    ).populate('owner', 'username displayName avatarUrl');

    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    return res.json(space);
  } catch (err) {
    console.error("updateSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

// POST /api/spaces/:id/star
export const toggleStarSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const space = await Space.findById(id);
    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    const isStarred = space.starredBy && space.starredBy.some(s => s.toString() === userId.toString());

    let updatedSpace;
    if (isStarred) {
      updatedSpace = await Space.findByIdAndUpdate(
        id,
        {
          $pull: { starredBy: userId },
          $inc: { starsCount: -1 }
        },
        { new: true }
      ).populate('owner', 'username displayName avatarUrl');
    } else {
      updatedSpace = await Space.findByIdAndUpdate(
        id,
        {
          $addToSet: { starredBy: userId },
          $inc: { starsCount: 1 }
        },
        { new: true }
      ).populate('owner', 'username displayName avatarUrl');
    }

    // Ensure starsCount doesn't go below 0
    if (updatedSpace.starsCount < 0) {
      updatedSpace.starsCount = 0;
      await updatedSpace.save();
    }

    return res.json(updatedSpace);
  } catch (err) {
    console.error("toggleStarSpace error:", err);
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
