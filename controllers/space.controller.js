import crypto from "crypto";
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
import SpaceView from "../models/SpaceView.js";
import deleteFromCloudinary from "../utils/deleteFromCloudinary.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";
import { logUserHistory } from "../utils/spaceHelpers.js";
import { can } from "../utils/authorization.js";
import { scanForSecrets } from "../utils/secretScanner.js";
import { createInboxNotification } from "../utils/notificationService.js";

/**
 * GET /api/spaces
 * List spaces with proper authorization and visibility filtering.
 */
export const getSpaces = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { tab, visibility } = req.query;

    let query = {};

    if (tab === 'starred') {
      query = { starredBy: ownerId, visibility: 'public' };
    } else if (tab === 'archived') {
      query = { owner: ownerId, isArchived: true };
    } else if (tab === 'shared') {
      // Spaces where user is a collaborator or public spaces
      query = {
        $or: [
          { 'collaborators.user': ownerId },
          { owner: { $ne: ownerId }, visibility: 'public' }
        ]
      };
    } else if (tab === 'mine') {
      query = { owner: ownerId, isArchived: { $ne: true } };
    } else {
      // 'all' or default -> user's owned spaces and collaborated spaces
      query = {
        $or: [
          { owner: ownerId },
          { 'collaborators.user': ownerId },
          { starredBy: ownerId, visibility: 'public' }
        ]
      };
    }

    if (visibility && ['public', 'private'].includes(visibility)) {
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

/**
 * GET /api/spaces/:id
 * Fetch a single space. Returns 404 if unauthorized or private.
 */
export const getSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const space = await Space.findById(id)
      .populate('owner', 'username displayName avatarUrl')
      .populate('collaborators.user', 'username displayName avatarUrl')
      .lean();

    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    // Check central authorization
    if (!can(req.user, 'view', space)) {
      return res.status(404).json({ error: "Space not found" });
    }

    // Track daily view deduplication for public spaces (exclude owner)
    if (space.visibility === 'public') {
      const isOwner = req.user?._id && space.owner?._id && req.user._id.toString() === space.owner._id.toString();
      if (!isOwner) {
        const viewerKey = req.user?._id ? req.user._id.toString() : (req.ip || 'guest');
        const viewDate = new Date().toISOString().slice(0, 10);
        try {
          const viewRecord = await SpaceView.create({ space: id, viewerKey, viewDate });
          if (viewRecord) {
            await Space.findByIdAndUpdate(id, { $inc: { viewsCount: 1 } });
            space.viewsCount = (space.viewsCount || 0) + 1;
          }
        } catch (dupErr) {
          // Already viewed today, ignored
        }
      }
    }

    return res.json(space);
  } catch (err) {
    console.error("getSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

/**
 * POST /api/spaces
 * Create a new space (starts private by default, public/private enum only).
 */
export const createSpace = async (req, res) => {
  try {
    const { name, description, tool, thumbnail, visibility, tags, iconKey, template, enabledModules, readme, allowCloning } = req.body;

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

    // Strict 2-state visibility
    const finalVisibility = visibility === 'public' ? 'public' : 'private';

    if (finalVisibility === 'public') {
      const scanResult = scanForSecrets({ name: trimmedName, description: trimmedDescription, readme });
      if (scanResult.hasSecrets) {
        return res.status(400).json({
          error: `Potential secrets detected (${scanResult.findings.join(', ')}). Please remove credentials before creating a public Space.`
        });
      }
    }

    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean);
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    }

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
      allowCloning: allowCloning !== false,
      icon: iconKey || 'ri-folder-line',
      iconKey: iconKey || 'ri-folder-line',
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
      notesCount: 0,
      learningsCount: 0,
      snippetsCount: 0,
      reposCount: 0,
      promptsCount: 0,
      communitiesCount: 0
    });

    const populatedSpace = await Space.findById(space._id).populate('owner', 'username displayName avatarUrl');

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

/**
 * PATCH /api/spaces/:id
 * Update a space with secret scanning on visibility changes.
 */
export const updateSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const existingSpace = await Space.findById(id);

    if (!existingSpace) {
      return res.status(404).json({ error: "Space not found" });
    }

    if (!can(req.user, 'manage_space', existingSpace)) {
      return res.status(404).json({ error: "Space not found" });
    }

    const {
      name,
      description,
      tool,
      thumbnail,
      visibility,
      tags,
      iconKey,
      isPinned,
      isArchived,
      template,
      enabledModules,
      readme,
      allowCloning,
      requestLinkEnabled,
      requestDescription,
      regenerateRequestToken
    } = req.body;

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
    if (allowCloning !== undefined) {
      update.allowCloning = Boolean(allowCloning);
    }
    if (requestDescription !== undefined) {
      update.requestDescription = String(requestDescription).trim();
    }

    // Request link token management
    if (requestLinkEnabled !== undefined) {
      update.requestLinkEnabled = Boolean(requestLinkEnabled);
      if (update.requestLinkEnabled && (!existingSpace.requestLinkToken || regenerateRequestToken)) {
        update.requestLinkToken = crypto.randomBytes(16).toString('hex');
      }
    } else if (regenerateRequestToken) {
      update.requestLinkToken = crypto.randomBytes(16).toString('hex');
    }

    // Visibility update & Secret Scanning
    if (visibility !== undefined && ['public', 'private'].includes(visibility)) {
      if (visibility === 'public' && existingSpace.visibility !== 'public') {
        // Scan space metadata and all items
        const items = await Item.find({ spaceId: id }).select('title content preview codeExample url').lean();
        const scanPayload = {
          name: update.name || existingSpace.name,
          description: update.description || existingSpace.description,
          readme: readme !== undefined ? readme : existingSpace.readme,
          items
        };
        const scanResult = scanForSecrets(scanPayload);
        if (scanResult.hasSecrets) {
          return res.status(400).json({
            error: `Cannot make Space public: potential secrets or credentials detected (${scanResult.findings.join(', ')}). Please remove sensitive data first.`
          });
        }
      }
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
      update.icon = iconKey;
    }

    if (tags !== undefined) {
      update.tags = Array.isArray(tags)
        ? tags.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean)
        : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    }

    const space = await Space.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    ).populate('owner', 'username displayName avatarUrl').populate('collaborators.user', 'username displayName avatarUrl');

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

/**
 * POST /api/spaces/:id/star
 * Toggle star on public spaces only.
 */
export const toggleStarSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const space = await Space.findById(id);
    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    // Only public spaces can be starred
    if (space.visibility !== 'public') {
      return res.status(400).json({ error: "Private spaces cannot be starred." });
    }

    // Cannot star own space
    if (space.owner.toString() === userId.toString()) {
      return res.status(400).json({ error: "You cannot star your own space." });
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

      // Dispatch notification to Space owner
      await createInboxNotification({
        recipient: space.owner,
        sender: userId,
        type: 'notification',
        category: 'space_starred',
        data: {
          spaceId: space._id,
          spaceName: space.name,
          text: `starred your Space "${space.name}"`
        }
      });
    }

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

/**
 * DELETE /api/spaces/:id
 * Delete space and clean up items and Cloudinary assets.
 */
export const deleteSpace = async (req, res) => {
  try {
    const { id: spaceId } = req.params;
    const owner = req.user._id;

    const space = await Space.findOne({ _id: spaceId, owner });
    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }

    await Space.findByIdAndDelete(spaceId);

    const cloudinaryItems = await Item.find({
      spaceId,
      cloudinaryPublicId: { $exists: true, $ne: '' }
    }).select('cloudinaryPublicId docType type').lean();

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

/**
 * PATCH /api/spaces/:spaceId/recount
 */
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

/**
 * POST /api/spaces/upload-thumbnail
 */
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
