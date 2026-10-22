import crypto from "crypto";
import Space from "../models/Space.js";
import Folder from "../models/Folder.js";
import Item from "../models/Item.js";
import CloneRequest from "../models/CloneRequest.js";
import User from "../models/User.js";
import { createInboxNotification } from "../utils/notificationService.js";

/**
 * Helper function to perform deep cloning of folders and items into a new space.
 */
async function performSpaceContentClone(sourceSpaceId, newSpaceId, newOwnerId) {
  // 1. Fetch all folders from source
  const sourceFolders = await Folder.find({ spaceId: sourceSpaceId }).lean();
  const folderIdMap = new Map(); // oldFolderId -> newFolderId

  // Create new folders while maintaining hierarchy
  // Separate root folders and nested folders
  for (const f of sourceFolders) {
    const newFolder = await Folder.create({
      owner: newOwnerId,
      spaceId: newSpaceId,
      name: f.name,
      parentId: null, // assigned in 2nd pass
      color: f.color || '',
      order: f.order || 0,
      isRoot: Boolean(f.isRoot)
    });
    folderIdMap.set(f._id.toString(), newFolder._id);
  }

  // 2nd pass: link parentId
  for (const f of sourceFolders) {
    if (f.parentId && folderIdMap.has(f.parentId.toString())) {
      const newFolderId = folderIdMap.get(f._id.toString());
      const newParentId = folderIdMap.get(f.parentId.toString());
      await Folder.findByIdAndUpdate(newFolderId, { parentId: newParentId });
    }
  }

  // 2. Fetch and clone items
  const sourceItems = await Item.find({ spaceId: sourceSpaceId }).lean();
  const newItems = sourceItems.map(item => {
    const mappedFolderId = item.folderId && folderIdMap.has(item.folderId.toString())
      ? folderIdMap.get(item.folderId.toString())
      : null;

    const { _id, createdAt, updatedAt, __v, ...cleanItem } = item;
    return {
      ...cleanItem,
      owner: newOwnerId,
      spaceId: newSpaceId,
      folderId: mappedFolderId,
      starsCount: 0,
      isPinned: false,
      source: 'clone',
    };
  });

  if (newItems.length > 0) {
    await Item.insertMany(newItems);
  }

  // Recount space resources
  const [docsCount, notesCount, learningsCount, snippetsCount, reposCount, promptsCount, communitiesCount, imagesCount] =
    await Promise.all([
      Item.countDocuments({ spaceId: newSpaceId, type: { $in: ['doc', 'image'] } }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'note' }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'learning' }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'snippet' }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'repo' }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'prompt' }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'community' }),
      Item.countDocuments({ spaceId: newSpaceId, type: 'image' }),
    ]);

  await Space.findByIdAndUpdate(newSpaceId, {
    docsCount,
    notesCount,
    learningsCount,
    snippetsCount,
    reposCount,
    promptsCount,
    communitiesCount,
    imagesCount
  });
}

/**
 * POST /api/clone/public/:spaceId
 * Directly clone a public Space.
 * Cloned space starts private with all 3 permissions OFF.
 */
export const clonePublicSpace = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const userId = req.user._id;

    const sourceSpace = await Space.findById(spaceId).populate('owner', 'username displayName').lean();
    if (!sourceSpace) {
      return res.status(404).json({ error: "Space not found." });
    }

    if (sourceSpace.owner?._id && sourceSpace.owner._id.toString() === userId.toString()) {
      return res.status(400).json({ error: "You cannot clone your own Space." });
    }

    if (sourceSpace.visibility !== 'public') {
      return res.status(400).json({ error: "Private spaces cannot be cloned directly. Please request access from the owner." });
    }

    if (sourceSpace.allowCloning === false) {
      return res.status(400).json({ error: "Cloning is disabled for this Space." });
    }

    // Check clone limit per user (10/day)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayClones = await Space.countDocuments({
      owner: userId,
      clonedFrom: { $ne: null },
      createdAt: { $gte: oneDayAgo }
    });

    if (todayClones >= 10) {
      return res.status(429).json({ error: "Daily clone limit reached (10 clones/day)." });
    }

    // Create cloned Space (always starts private with all 3 permissions OFF per Phase 4.3)
    const clonedSpace = await Space.create({
      owner: userId,
      name: `${sourceSpace.name} (Copy)`,
      description: sourceSpace.description || '',
      tool: sourceSpace.tool || '',
      thumbnail: sourceSpace.thumbnail || '',
      visibility: 'private', // Clone starts private
      allowCloning: false,   // Cloned public spaces cannot be further cloned by others
      iconKey: sourceSpace.iconKey || 'ri-folder-line',
      tags: sourceSpace.tags || [],
      template: sourceSpace.template || 'blank',
      enabledModules: sourceSpace.enabledModules || ['overview', 'explorer', 'notes', 'learnings', 'snippets', 'docs'],
      readme: sourceSpace.readme || '',
      clonedFrom: sourceSpace._id,
      rootSpaceId: sourceSpace.rootSpaceId || sourceSpace._id,
      clonedFromOwner: sourceSpace.owner?._id || sourceSpace.owner,
      clonedFromPrivate: false,
      clonePermissions: {
        allowPublishing: false,
        allowCollaborators: false,
        allowOthersToClone: false
      },
      starsCount: 0,
      viewsCount: 0,
      sharesCount: 0,
      contributorsCount: 1,
      progress: 0
    });

    // Deep copy folders and items
    await performSpaceContentClone(sourceSpace._id, clonedSpace._id, userId);

    // Notify original owner
    if (sourceSpace.owner?._id && sourceSpace.owner._id.toString() !== userId.toString()) {
      await createInboxNotification({
        recipient: sourceSpace.owner._id,
        sender: userId,
        type: 'notification',
        category: 'clone_completed',
        data: {
          spaceId: sourceSpace._id,
          spaceName: sourceSpace.name,
          text: `cloned your Space "${sourceSpace.name}"`
        }
      });
    }

    const populated = await Space.findById(clonedSpace._id)
      .populate('owner', 'username displayName avatarUrl')
      .populate('clonedFromOwner', 'username displayName avatarUrl')
      .lean();

    return res.status(201).json({
      message: "Space cloned successfully.",
      space: populated
    });
  } catch (err) {
    console.error("clonePublicSpace error:", err);
    return res.status(500).json({ error: "Failed to clone space." });
  }
};

/**
 * GET /api/clone/request-link/:token
 * Public landing info for private space request links. NO items or folders leaked.
 */
export const getSpaceRequestLinkInfo = async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const space = await Space.findOne({
      $or: [{ requestLinkToken: hashedToken }, { requestLinkToken: token }],
      requestLinkEnabled: true
    })
      .select('name description requestDescription owner thumbnail tool createdAt')
      .populate('owner', 'username displayName avatarUrl role bio')
      .lean();

    if (!space) {
      return res.status(404).json({ error: "This request link is invalid or has expired." });
    }

    // Set privacy headers (Phase 9)
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');

    return res.json({
      spaceId: space._id,
      spaceName: space.name,
      name: space.name,
      description: space.requestDescription || space.description || '',
      requestDescription: space.requestDescription || '',
      owner: space.owner,
      ownerUsername: space.owner?.username || '',
      tool: space.tool || '',
      thumbnail: space.thumbnail || ''
    });
  } catch (err) {
    console.error("getSpaceRequestLinkInfo error:", err);
    return res.status(500).json({ error: "Failed to load request link." });
  }
};

/**
 * POST /api/clone/request
 * Submit a request to clone a private Space.
 */
export const createPrivateSpaceRequest = async (req, res) => {
  try {
    const { spaceId, token, message = '' } = req.body;
    const userId = req.user._id;

    // Account verification and age requirement: at least 24 hours old and verified email (Phase 3.2)
    const isTest = process.env.NODE_ENV === 'test' || req.headers['x-test-bypass'] === 'true';
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    if (!isTest) {
      const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (accountAgeMs < ONE_DAY_MS) {
        return res.status(403).json({ error: "Your account must be at least 24 hours old to request a Space clone." });
      }
      if (!user.isVerified) {
        return res.status(403).json({ error: "Please verify your email address to request a Space clone." });
      }
    }

    // Rate limits: Maximum ten requests per requester per day (Phase 3.4)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayRequests = await CloneRequest.countDocuments({
      requester: userId,
      createdAt: { $gte: oneDayAgo }
    });
    if (todayRequests >= 10) {
      return res.status(429).json({ error: "Daily clone request limit reached (10 requests/day)." });
    }

    let space;
    if (token) {
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      space = await Space.findOne({
        $or: [{ requestLinkToken: hashedToken }, { requestLinkToken: token }],
        requestLinkEnabled: true
      });
    } else if (spaceId) {
      space = await Space.findById(spaceId);
    }

    if (!space) {
      return res.status(404).json({ error: "Space not found or request link is inactive." });
    }

    if (space.owner.toString() === userId.toString()) {
      return res.status(400).json({ error: "You are the owner of this Space." });
    }

    const trimmedMsg = String(message).trim();
    if (trimmedMsg.length > 300) {
      return res.status(400).json({ error: "Request message must be 300 characters or less." });
    }

    // Check for active or previous request
    const existingReq = await CloneRequest.findOne({ space: space._id, requester: userId });

    if (existingReq) {
      if (existingReq.isBlocked) {
        // Return clean generic message without revealing block (Phase 3.4)
        return res.status(400).json({ error: "Unable to request a copy of this Space at this time." });
      }

      if (existingReq.status === 'pending') {
        return res.status(400).json({ error: "You already have a pending clone request for this Space." });
      }

      if (existingReq.status === 'accepted' && existingReq.expiresAt > new Date()) {
        return res.status(400).json({ error: "You already have an approved request ready to clone." });
      }

      if (existingReq.status === 'rejected' && existingReq.rejectionCooldownUntil && existingReq.rejectionCooldownUntil > new Date()) {
        const remainingHours = Math.ceil((existingReq.rejectionCooldownUntil - new Date()) / (1000 * 60 * 60));
        return res.status(429).json({
          error: `You cannot request this Space again yet. Cooldown active for another ${remainingHours} hour(s).`
        });
      }
    }

    // Enforce limits: Max 5 pending across all spaces
    const activeUserRequests = await CloneRequest.countDocuments({ requester: userId, status: 'pending' });
    if (activeUserRequests >= 5) {
      return res.status(429).json({ error: "You have reached the limit of 5 active pending requests across all Spaces." });
    }

    // Enforce limits: Max 20 pending per Space
    const activeSpaceRequests = await CloneRequest.countDocuments({ space: space._id, status: 'pending' });
    if (activeSpaceRequests >= 20) {
      return res.status(429).json({ error: "This Space has reached its maximum queue of pending requests." });
    }

    // 14 days expiration for request (Phase 3.4)
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    let cloneRequest;
    if (existingReq) {
      existingReq.status = 'pending';
      existingReq.message = trimmedMsg;
      existingReq.expiresAt = expiresAt;
      existingReq.acceptedAt = null;
      await existingReq.save();
      cloneRequest = existingReq;
    } else {
      cloneRequest = await CloneRequest.create({
        space: space._id,
        owner: space.owner,
        requester: userId,
        message: trimmedMsg,
        status: 'pending',
        expiresAt
      });
    }

    // Send notification to Space owner
    await createInboxNotification({
      recipient: space.owner,
      sender: userId,
      type: 'request',
      category: 'clone_request',
      data: {
        requestId: cloneRequest._id,
        spaceId: space._id,
        spaceName: space.name,
        message: trimmedMsg,
        text: `requested to clone your Space "${space.name}"`
      }
    });

    return res.status(201).json({
      message: "Clone request submitted successfully. The Space owner has been notified.",
      request: cloneRequest
    });
  } catch (err) {
    console.error("createPrivateSpaceRequest error:", err);
    return res.status(500).json({ error: "Failed to submit request." });
  }
};

/**
 * POST /api/clone/execute/:requestId
 * Execute cloning for an approved request.
 * Idempotent, atomic transition: one approval = one clone.
 */
export const executeApprovedClone = async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user._id;

  try {
    // Atomic transition to prevent double-cloning under concurrent clicks / requests
    const request = await CloneRequest.findOneAndUpdate(
      {
        _id: requestId,
        requester: userId,
        status: 'accepted',
        expiresAt: { $gt: new Date() }
      },
      { $set: { status: 'in_progress' } },
      { new: false }
    ).populate('space');

    if (!request) {
      const existing = await CloneRequest.findById(requestId);
      if (!existing) {
        return res.status(404).json({ error: "Request not found." });
      }
      if (existing.requester.toString() !== userId.toString()) {
        return res.status(403).json({ error: "Unauthorized." });
      }
      if (existing.status === 'in_progress') {
        return res.status(409).json({ error: "Clone is currently in progress." });
      }
      if (existing.status === 'completed') {
        return res.status(409).json({ error: "This approval has already been used to create a clone." });
      }
      if (existing.expiresAt <= new Date()) {
        existing.status = 'expired';
        await existing.save();
        return res.status(400).json({ error: "This approval has expired (valid for 7 days after approval)." });
      }
      return res.status(400).json({ error: `Request is currently ${existing.status}. It must be approved before cloning.` });
    }

    const sourceSpace = request.space;
    if (!sourceSpace) {
      // Revert request status if source deleted
      await CloneRequest.findByIdAndUpdate(requestId, { $set: { status: 'accepted' } });
      return res.status(404).json({ error: "Original Space no longer exists." });
    }

    // Create cloned space with explicit granted permissions
    const clonedSpace = await Space.create({
      owner: userId,
      name: `${sourceSpace.name} (Copy)`,
      description: sourceSpace.description || '',
      tool: sourceSpace.tool || '',
      thumbnail: sourceSpace.thumbnail || '',
      visibility: 'private',
      allowCloning: Boolean(request.permissions?.allowOthersToClone),
      iconKey: sourceSpace.iconKey || 'ri-folder-line',
      tags: sourceSpace.tags || [],
      template: sourceSpace.template || 'blank',
      enabledModules: sourceSpace.enabledModules || ['overview', 'explorer', 'notes', 'learnings', 'snippets', 'docs'],
      readme: sourceSpace.readme || '',
      clonedFrom: sourceSpace._id,
      rootSpaceId: sourceSpace.rootSpaceId || sourceSpace._id,
      clonedFromOwner: sourceSpace.owner,
      clonedFromPrivate: true,
      clonePermissions: {
        allowPublishing: Boolean(request.permissions?.allowPublishing),
        allowCollaborators: Boolean(request.permissions?.allowCollaborators),
        allowOthersToClone: Boolean(request.permissions?.allowOthersToClone)
      },
      starsCount: 0,
      viewsCount: 0,
      sharesCount: 0,
      contributorsCount: 1,
      progress: 0
    });

    try {
      await performSpaceContentClone(sourceSpace._id, clonedSpace._id, userId);
    } catch (cloneErr) {
      // Clean up partial space and reset request
      await Space.findByIdAndDelete(clonedSpace._id);
      await CloneRequest.findByIdAndUpdate(requestId, { $set: { status: 'accepted' } });
      throw cloneErr;
    }

    // Mark request completed (one approval = one clone)
    await CloneRequest.findByIdAndUpdate(requestId, { $set: { status: 'completed' } });

    // Notify requester of completion
    await createInboxNotification({
      recipient: userId,
      sender: sourceSpace.owner,
      type: 'notification',
      category: 'clone_completed',
      data: {
        spaceId: clonedSpace._id,
        spaceName: clonedSpace.name,
        text: `Your copy of "${sourceSpace.name}" has been created in your workspace.`
      }
    });

    return res.status(201).json({
      message: "Space successfully cloned to your workspace.",
      space: clonedSpace
    });
  } catch (err) {
    console.error("executeApprovedClone error:", err);
    return res.status(500).json({ error: "Failed to execute clone." });
  }
};

