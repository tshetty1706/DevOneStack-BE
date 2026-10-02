import Space from "../models/Space.js";
import History from "../models/History.js";
import Learning from "../models/Learning.js";
import Snippet from "../models/Snippet.js";
import SnippetContent from "../models/SnippetContent.js";
import Doc from "../models/Doc.js";
import Repo from "../models/Repo.js";
import Prompt from "../models/Prompt.js";
import Community from "../models/Community.js";
import Folder from "../models/Folder.js";
import Item from "../models/Item.js";
import deleteFromCloudinary from "../utils/deleteFromCloudinary.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";
import { logUserHistory } from "../utils/spaceHelpers.js";

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
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();

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
    }).populate('owner', 'username displayName avatarUrl').lean();

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
    const { name, description, tool, thumbnail, visibility, tags, iconKey, template, enabledModules, readme } = req.body;

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

    // Parse enabledModules: Overview and Explorer are ALWAYS first and fixed
    let finalModules = ['overview', 'explorer'];
    if (Array.isArray(enabledModules) && enabledModules.length > 0) {
      const sanitized = enabledModules.map(m => typeof m === 'string' ? m.trim().toLowerCase() : '').filter(Boolean);
      finalModules = ['overview', 'explorer', ...sanitized.filter(m => m !== 'overview' && m !== 'explorer')];
    } else {
      finalModules = ['overview', 'explorer', 'notes', 'learnings', 'snippets', 'docs'];
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
      template: (template || 'blank').trim(),
      enabledModules: finalModules,
      readme: typeof readme === 'string' ? readme : '',
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
    const { name, description, tool, thumbnail, visibility, tags, iconKey, isPinned, isArchived, template, enabledModules, readme } = req.body;
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
    if (template !== undefined) {
      update.template = typeof template === 'string' ? template.trim() : 'blank';
    }
    if (enabledModules !== undefined) {
      const sanitized = Array.isArray(enabledModules)
        ? enabledModules.map(m => typeof m === 'string' ? m.trim().toLowerCase() : '').filter(Boolean)
        : [];
      update.enabledModules = ['overview', 'explorer', ...sanitized.filter(m => m !== 'overview' && m !== 'explorer')];
    }
    if (readme !== undefined) {
      update.readme = typeof readme === 'string' ? readme : '';
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

    if (readme !== undefined) {
      await logUserHistory(req.user._id, 'updated_readme', `Updated Space README`, { spaceId: id });
    } else if (visibility !== undefined) {
      await logUserHistory(req.user._id, 'updated_visibility', `Changed visibility to ${visibility}`, { spaceId: id });
    } else {
      await logUserHistory(req.user._id, 'updated_space', `Updated Space "${space.name}"`, { spaceId: id });
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

    // Get items with Cloudinary assets for cleanup
    const cloudinaryItems = await Item.find({
      spaceId,
      cloudinaryPublicId: { $exists: true, $ne: '' }
    }).select('cloudinaryPublicId docType type').lean();

    // Delete everything in parallel
    await Promise.all([
      Folder.deleteMany({ spaceId }),
      Item.deleteMany({ spaceId }),
      Doc.deleteMany({ spaceId }).catch(() => {}),
      Learning.deleteMany({ spaceId }).catch(() => {}),
      Snippet.deleteMany({ spaceId }).catch(() => {}),
      SnippetContent.deleteMany({}).catch(() => {}),
      Repo.deleteMany({ spaceId }).catch(() => {}),
      Prompt.deleteMany({ spaceId }).catch(() => {}),
      Community.deleteMany({ spaceId }).catch(() => {}),
      History.deleteMany({ 'meta.spaceId': spaceId }),
    ]);

    // Delete Cloudinary files for this space
    await Promise.allSettled(
      cloudinaryItems.map(item =>
        deleteFromCloudinary(
          item.cloudinaryPublicId,
          (item.docType === 'pdf' || item.type === 'pdf') ? 'raw' : 'image'
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

    const [docsCount, notesCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount, imagesCount] =
      await Promise.all([
        Item.countDocuments({ spaceId, type: { $in: ['doc', 'image'] } }),
        Item.countDocuments({ spaceId, type: 'note' }),
        Item.countDocuments({ spaceId, type: 'learning' }),
        Item.countDocuments({ spaceId, type: 'snippet' }),
        Item.countDocuments({ spaceId, type: 'repo' }),
        Item.countDocuments({ spaceId, type: 'prompt' }),
        Item.countDocuments({ spaceId, type: 'community' }),
        Item.countDocuments({ spaceId, type: 'image' }),
      ]);

    const updated = await Space.findOneAndUpdate(
      { _id: spaceId, owner },
      {
        $set: {
          docsCount, notesCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    return res.json({
      message: 'Counts repaired',
      counts: { docsCount, notesCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount }
    });
  } catch (err) {
    console.error("recountSpace error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/spaces/upload-thumbnail
export const uploadSpaceThumbnail = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Please select an image file to upload." });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: "Only image files (JPEG, PNG, WEBP, GIF) are supported." });
    }

    // Limit thumbnail to max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "Thumbnail file size cannot exceed 10MB." });
    }

    const rawName = file.originalname || 'thumbnail';
    const lastDot = rawName.lastIndexOf('.');
    const baseName = lastDot > 0 ? rawName.substring(0, lastDot) : rawName;
    const cleanOrigName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    const customPublicId = `thumb-${cleanOrigName}-${Date.now()}`;

    let cloudinaryResult;
    try {
      cloudinaryResult = await uploadToCloudinary(file.buffer, {
        folder: `devonestack/thumbnails/${req.user._id}`,
        public_id: customPublicId,
        resource_type: 'image',
        type: 'upload',
        access_mode: 'public',
      });
    } catch (uploadErr) {
      console.error("Cloudinary thumbnail upload failed:", uploadErr);
      return res.status(500).json({ error: "Unable to upload thumbnail. Please try again." });
    }

    return res.status(200).json({
      url: cloudinaryResult.secure_url || cloudinaryResult.url,
      publicId: cloudinaryResult.public_id,
      width: cloudinaryResult.width,
      height: cloudinaryResult.height,
      format: cloudinaryResult.format,
      bytes: cloudinaryResult.bytes,
    });
  } catch (err) {
    console.error("uploadSpaceThumbnail error:", err);
    return res.status(500).json({ error: "Unable to upload thumbnail. Please try again." });
  }
};
