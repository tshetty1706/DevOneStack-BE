import mongoose from 'mongoose';
import axios from 'axios';
import Item from '../models/Item.js';
import Folder from '../models/Folder.js';
import Space from '../models/Space.js';
import Doc from '../models/Doc.js';
import Learning from '../models/Learning.js';
import Snippet from '../models/Snippet.js';
import SnippetContent from '../models/SnippetContent.js';
import Prompt from '../models/Prompt.js';
import Repo from '../models/Repo.js';
import Community from '../models/Community.js';
import uploadToCloudinary, { detectFileType } from '../utils/uploadToCloudinary.js';
import deleteFromCloudinary from '../utils/deleteFromCloudinary.js';
import { saveFileLocally, deleteLocalFile, getLocalFilePath, fetchAndCacheCloudinaryRawAsset } from '../utils/fileStorage.js';
import cloudinary from '../config/cloudinary.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError
} from '../utils/spaceHelpers.js';

/**
 * Build folder map for fast path lookup
 */
async function getFolderPathMap(spaceId) {
  const folders = await Folder.find({ spaceId }).lean();
  const folderMap = new Map();
  folders.forEach(f => {
    folderMap.set(f._id.toString(), {
      _id: f._id.toString(),
      name: f.name,
      parentId: f.parentId ? f.parentId.toString() : null,
    });
  });

  const pathMap = new Map();
  folderMap.forEach((f, id) => {
    let curr = f;
    const parts = [curr.name];
    const visited = new Set([id]);
    while (curr.parentId && folderMap.has(curr.parentId)) {
      if (visited.has(curr.parentId)) break;
      visited.add(curr.parentId);
      curr = folderMap.get(curr.parentId);
      parts.unshift(curr.name);
    }
    pathMap.set(id, {
      name: f.name,
      path: parts.join(' / '),
      pathArray: parts
    });
  });

  return pathMap;
}

/**
 * Resilient, safe background sync from legacy collections to canonical Item
 */
async function autoMigrateLegacyItems(spaceId, ownerId) {
  try {
    // 1. Migrate Docs
    const docs = await Doc.find({ spaceId }).lean();
    for (const d of docs) {
      const exists = await Item.exists({ _id: d._id });
      if (!exists) {
        await Item.create({
          _id: d._id,
          owner: d.owner || ownerId,
          spaceId,
          folderId: d.folderId || null,
          title: d.title || 'Untitled Doc',
          type: d.type === 'image' ? 'image' : 'doc',
          docType: d.type || 'url',
          url: d.url || '',
          cloudinaryUrl: d.cloudinaryUrl || '',
          cloudinaryPublicId: d.cloudinaryPublicId || '',
          format: d.format || '',
          fileSize: d.fileSize || 0,
          caption: d.caption || '',
          tags: d.tags || [],
          isPinned: d.isPinned || false,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        }).catch(() => {});
      }
    }

    // 2. Migrate Snippets
    const snippets = await Snippet.find({ spaceId }).lean();
    for (const s of snippets) {
      const exists = await Item.exists({ _id: s._id });
      if (!exists) {
        const contentDoc = await SnippetContent.findOne({ snippetId: s._id }).lean();
        await Item.create({
          _id: s._id,
          owner: s.owner || ownerId,
          spaceId,
          folderId: s.folderId || null,
          title: s.name || 'Untitled Snippet',
          type: 'snippet',
          content: contentDoc?.code || '',
          language: s.language || 'javascript',
          caption: s.caption || '',
          preview: s.preview || '',
          tags: s.tags || [],
          isPinned: s.isPinned || false,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }).catch(() => {});
      }
    }

    // 3. Migrate Learnings
    const learnings = await Learning.find({ spaceId }).lean();
    for (const l of learnings) {
      const exists = await Item.exists({ _id: l._id });
      if (!exists) {
        await Item.create({
          _id: l._id,
          owner: l.owner || ownerId,
          spaceId,
          folderId: l.folderId || null,
          title: l.title || 'Untitled Learning',
          type: 'learning',
          learningType: l.type || 'learning',
          content: l.content || '',
          codeExample: l.codeExample || null,
          tags: l.tags || [],
          isPinned: l.isPinned || false,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt
        }).catch(() => {});
      }
    }

    // 4. Migrate Prompts
    const prompts = await Prompt.find({ spaceId }).lean();
    for (const p of prompts) {
      const exists = await Item.exists({ _id: p._id });
      if (!exists) {
        await Item.create({
          _id: p._id,
          owner: p.owner || ownerId,
          spaceId,
          folderId: p.folderId || null,
          title: p.title || 'Untitled Prompt',
          type: 'prompt',
          content: p.body || '',
          caption: p.caption || '',
          model: p.model || 'GPT-4o',
          tags: p.tags || [],
          isPinned: p.isPinned || false,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }).catch(() => {});
      }
    }

    // 5. Migrate Repos
    const repos = await Repo.find({ spaceId }).lean();
    for (const r of repos) {
      const exists = await Item.exists({ _id: r._id });
      if (!exists) {
        await Item.create({
          _id: r._id,
          owner: r.owner || ownerId,
          spaceId,
          folderId: r.folderId || null,
          title: r.name || 'Untitled Repo',
          type: 'repo',
          url: r.url || '',
          caption: r.caption || r.description || '',
          platform: r.platform || 'github',
          isOwn: r.isOwn || false,
          tags: r.tags || [],
          isPinned: r.isPinned || false,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }).catch(() => {});
      }
    }

    // 6. Migrate Communities
    const communities = await Community.find({ spaceId }).lean();
    for (const c of communities) {
      const exists = await Item.exists({ _id: c._id });
      if (!exists) {
        await Item.create({
          _id: c._id,
          owner: c.owner || ownerId,
          spaceId,
          folderId: null,
          title: c.name || 'Untitled Community',
          type: 'community',
          url: c.url || '',
          platform: c.platform || 'other',
          caption: c.caption || '',
          memberCount: c.memberCount || '',
          tags: c.tags || [],
          isPinned: c.isPinned || false,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('autoMigrateLegacyItems error:', err);
  }
}

// GET /api/spaces/:spaceId/items
export const listItems = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { type, folderId, search, tag, sort } = req.query;

    const space = await Space.findOne({
      _id: spaceId,
      $or: [
        { owner: req.user._id },
        { visibility: { $in: ['public', 'unlisted'] } }
      ]
    }).lean();

    if (!space) return res.status(404).json({ error: 'Space not found' });

    // Ensure migration if needed
    await autoMigrateLegacyItems(spaceId, req.user._id);

    const filter = { spaceId };
    if (type && type !== 'all') {
      if (type === 'doc') {
        filter.type = { $in: ['doc', 'image'] };
      } else {
        filter.type = type;
      }
    }
    if (folderId && folderId !== 'all') {
      if (folderId === 'root' || folderId === 'null') {
        filter.folderId = null;
      } else {
        filter.folderId = folderId;
      }
    }
    if (tag) {
      filter.tags = tag.toLowerCase().trim();
    }
    if (search) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }

    const items = await Item.find(filter)
      .sort({ isPinned: -1, title: 1, updatedAt: -1 })
      .lean();

    const pathMap = await getFolderPathMap(spaceId);

    const enrichedItems = items.map(itm => {
      const folderInfo = itm.folderId ? pathMap.get(itm.folderId.toString()) : null;
      return {
        ...itm,
        folderName: folderInfo?.name || 'Space Root',
        folderPath: folderInfo?.path || 'Space Root',
        folderPathArray: folderInfo?.pathArray || []
      };
    }).sort((a, b) => {
      // Pinned first, then alphabetical
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    });

    res.json({ items: enrichedItems });
  } catch (err) {
    sendError(res, err, 'Failed to list items');
  }
};

// GET /api/spaces/:spaceId/items/:itemId
export const getItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;

    const space = await Space.findOne({
      _id: spaceId,
      $or: [
        { owner: req.user._id },
        { visibility: { $in: ['public', 'unlisted'] } }
      ]
    }).lean();

    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId }).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    res.json({
      item: {
        ...item,
        folderName: folderInfo?.name || 'Space Root',
        folderPath: folderInfo?.path || 'Space Root',
        folderPathArray: folderInfo?.pathArray || []
      }
    });
  } catch (err) {
    sendError(res, err, 'Failed to get item');
  }
};

// POST /api/spaces/:spaceId/items
export const createItem = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const {
      type, folderId, title, content, caption, tags,
      language, codeExample, url, docType, learningType,
      model, repoName, platform, memberCount, credentials,
      cloudinaryUrl, cloudinaryPublicId,
      format, fileSize, width, height
    } = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'Item title is required' });
    }

    const validTypes = ['note', 'doc', 'snippet', 'learning', 'prompt', 'repo', 'image', 'community'];
    const finalType = validTypes.includes(type) ? type : 'note';

    // Verify or assign folderId (null means Space Root)
    let finalFolderId = null;
    if (
      folderId &&
      folderId !== 'root' &&
      folderId !== 'null' &&
      folderId !== 'undefined' &&
      folderId !== 'note' &&
      folderId !== 'learning' &&
      folderId !== 'doc' &&
      folderId !== 'snippet' &&
      folderId !== 'prompt' &&
      folderId !== 'repo' &&
      folderId !== 'image' &&
      folderId !== 'community'
    ) {
      if (mongoose.Types.ObjectId.isValid(folderId)) {
        const folderExists = await Folder.findOne({ _id: folderId, spaceId });
        if (folderExists) {
          finalFolderId = folderId;
        }
      }
    }

    const preview = content
      ? content.replace(/[#*`_~[\]()]/g, '').slice(0, 250).trim()
      : (caption || '').slice(0, 250).trim();

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: finalFolderId,
      title: trimmedTitle,
      type: finalType,
      content: content || '',
      preview,
      caption: (caption || '').trim(),
      tags: parseTags(tags),
      language: language || 'javascript',
      codeExample: codeExample || null,
      url: (url || '').trim(),
      docType: docType || (finalType === 'image' ? 'image' : 'markdown'),
      learningType: learningType || 'learning',
      model: model || '',
      repoName: repoName || '',
      platform: platform || 'other',
      memberCount: (memberCount || '').trim(),
      credentials: credentials || '',
      cloudinaryUrl: cloudinaryUrl || '',
      cloudinaryPublicId: cloudinaryPublicId || '',
      format: format || '',
      fileSize: fileSize || 0,
      width: width || null,
      height: height || null,
    });

    // Update space count
    const countField = `${finalType}sCount`;
    if (space[countField] !== undefined) {
      await updateSpaceResourceCount(spaceId, countField, 1);
    }

    await logUserHistory(
      req.user._id,
      `created_${finalType}`,
      `Created ${finalType} "${item.title}"`,
      { spaceId, itemId: item._id, type: finalType }
    );

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    res.status(201).json({
      item: {
        ...item.toObject(),
        folderName: folderInfo?.name || 'Space Root',
        folderPath: folderInfo?.path || 'Space Root',
        folderPathArray: folderInfo?.pathArray || []
      }
    });
  } catch (err) {
    sendError(res, err, 'Failed to create item');
  }
};

// PATCH /api/spaces/:spaceId/items/:itemId
export const updateItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;
    const updates = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (updates.title !== undefined) {
      const trimmed = updates.title.trim();
      if (!trimmed) return res.status(400).json({ error: 'Title cannot be empty' });
      item.title = trimmed;
    }

    if (updates.content !== undefined) {
      item.content = updates.content;
      item.preview = updates.content.replace(/[#*`_~[\]()]/g, '').slice(0, 250).trim();
    }

    if (updates.folderId !== undefined) {
      if (
        updates.folderId &&
        updates.folderId !== 'root' &&
        updates.folderId !== 'null' &&
        updates.folderId !== 'undefined' &&
        updates.folderId !== 'note' &&
        updates.folderId !== 'learning' &&
        updates.folderId !== 'doc' &&
        updates.folderId !== 'snippet' &&
        updates.folderId !== 'prompt' &&
        updates.folderId !== 'repo' &&
        updates.folderId !== 'image'
      ) {
        if (mongoose.Types.ObjectId.isValid(updates.folderId)) {
          const folderExists = await Folder.findOne({ _id: updates.folderId, spaceId });
          if (folderExists) {
            item.folderId = updates.folderId;
          } else {
            item.folderId = null;
          }
        } else {
          item.folderId = null;
        }
      } else {
        item.folderId = null;
      }
    }

    if (updates.tags !== undefined) {
      item.tags = parseTags(updates.tags);
    }

    if (updates.caption !== undefined) item.caption = updates.caption.trim();
    if (updates.language !== undefined) item.language = updates.language;
    if (updates.codeExample !== undefined) item.codeExample = updates.codeExample;
    if (updates.url !== undefined) item.url = updates.url.trim();
    if (updates.learningType !== undefined) item.learningType = updates.learningType;
    if (updates.docType !== undefined) item.docType = updates.docType;
    if (updates.model !== undefined) item.model = updates.model;
    if (updates.platform !== undefined) item.platform = updates.platform;
    if (updates.memberCount !== undefined) item.memberCount = updates.memberCount.trim();
    if (updates.credentials !== undefined) item.credentials = updates.credentials;
    if (updates.isPinned !== undefined) item.isPinned = !!updates.isPinned;

    await item.save();

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    if (updates.folderId !== undefined) {
      await logUserHistory(
        req.user._id,
        `moved_${item.type}`,
        `Moved ${item.type} "${item.title}" to ${folderInfo?.name || 'Space Root'}`,
        { spaceId, itemId: item._id, type: item.type }
      );
    } else {
      await logUserHistory(
        req.user._id,
        `updated_${item.type}`,
        `Updated ${item.type} "${item.title}"`,
        { spaceId, itemId: item._id, type: item.type }
      );
    }

    res.json({
      item: {
        ...item.toObject(),
        folderName: folderInfo?.name || 'Space Root',
        folderPath: folderInfo?.path || 'Space Root',
        folderPathArray: folderInfo?.pathArray || []
      }
    });
  } catch (err) {
    sendError(res, err, 'Failed to update item');
  }
};

// PATCH /api/spaces/:spaceId/items/:itemId/pin
export const togglePinItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err, 'Failed to toggle pin');
  }
};

// POST /api/spaces/:spaceId/items/upload
export const uploadItem = async (req, res) => {
  let uploadedCloudinaryPublicId = null;
  let uploadedResourceType = 'image';

  try {
    const { spaceId } = req.params;
    const { title, caption, tags, folderId, type } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const { isPdf, isImage, docType, resourceType } = detectFileType(file);
    uploadedResourceType = resourceType;

    const requestedType = type || (isImage ? 'image' : 'doc');
    const finalType = ['doc', 'image', 'note', 'learning', 'snippet', 'prompt', 'repo', 'community'].includes(requestedType)
      ? requestedType
      : 'doc';

    const fileExt = file.originalname.substring(file.originalname.lastIndexOf('.')) || (isPdf ? '.pdf' : '.jpg');
    const cleanOrigName = file.originalname.substring(0, file.originalname.lastIndexOf('.'))
      .replace(/[^a-zA-Z0-9]/g, '_') || 'file';
    const customPublicId = isPdf
      ? `${cleanOrigName}-${Date.now()}${fileExt}`
      : `${cleanOrigName}-${Date.now()}`;

    const folder = `devonestack/${req.user._id}/${spaceId}`;

    // 1. Save locally for 100% reliable zero-error streaming
    const localSave = await saveFileLocally(file.buffer, file.originalname, isPdf ? 'documents' : 'images');

    // 2. Upload to Cloudinary for CDN delivery
    let cloudinaryResult = null;
    try {
      cloudinaryResult = await uploadToCloudinary(file.buffer, {
        folder,
        public_id: customPublicId,
        resource_type: resourceType,
        type: 'upload',
      });
      uploadedCloudinaryPublicId = cloudinaryResult?.public_id;
    } catch (uploadErr) {
      console.warn("[Upload Pipeline] Cloudinary upload warning (using local file fallback):", uploadErr.message);
    }

    let finalFolderId = null;
    if (
      folderId &&
      folderId !== 'root' &&
      folderId !== 'null' &&
      folderId !== 'undefined'
    ) {
      if (mongoose.Types.ObjectId.isValid(folderId)) {
        const folderExists = await Folder.findOne({ _id: folderId, spaceId });
        if (folderExists) {
          finalFolderId = folderId;
        }
      }
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags);
      } catch (e) {
        parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      }
    }

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: finalFolderId,
      title: title?.trim() || file.originalname,
      type: finalType,
      docType: docType,
      cloudinaryPublicId: cloudinaryResult?.public_id || '',
      cloudinaryUrl: cloudinaryResult?.secure_url || cloudinaryResult?.url || (localSave ? `/${localSave.relativePath}` : ''),
      format: cloudinaryResult?.format || (isPdf ? 'pdf' : fileExt.replace('.', '')),
      fileSize: cloudinaryResult?.bytes || file.size,
      width: cloudinaryResult?.width || null,
      height: cloudinaryResult?.height || null,
      localPath: localSave?.relativePath || '',
      caption: caption?.trim() || '',
      tags: parseTags(parsedTags),
    });

    const countField = `${finalType}sCount`;
    if (space[countField] !== undefined) {
      await updateSpaceResourceCount(spaceId, countField, 1);
    }

    await logUserHistory(
      req.user._id,
      `created_${finalType}`,
      `Uploaded ${finalType} "${item.title}"`,
      { spaceId, itemId: item._id }
    );

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    res.status(201).json({
      item: {
        ...item.toObject(),
        folderName: folderInfo?.name || 'Space Root',
        folderPath: folderInfo?.path || 'Space Root',
        folderPathArray: folderInfo?.pathArray || []
      },
      doc: item
    });
  } catch (err) {
    // Transaction Rollback: Clean orphaned Cloudinary asset if database save failed
    if (uploadedCloudinaryPublicId) {
      try {
        await deleteFromCloudinary(uploadedCloudinaryPublicId, uploadedResourceType);
      } catch (cleanErr) {
        console.error('[Upload Pipeline] Rollback error:', cleanErr);
      }
    }
    sendError(res, err, 'Failed to save uploaded item');
  }
};

// GET /api/spaces/:spaceId/items/:itemId/file
export const getItemFile = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;
    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const isPdf =
      item.docType === 'pdf' ||
      item.type === 'pdf' ||
      item.format === 'pdf' ||
      (item.title && item.title.toLowerCase().endsWith('.pdf')) ||
      (item.cloudinaryUrl && item.cloudinaryUrl.toLowerCase().includes('.pdf')) ||
      (item.cloudinaryPublicId && item.cloudinaryPublicId.toLowerCase().includes('.pdf')) ||
      (item.url && item.url.toLowerCase().includes('.pdf'));

    // Priority 1: Serve directly from local disk (instant, 0 401s, supports Range requests)
    if (item.localPath) {
      const absPath = getLocalFilePath(item.localPath);
      if (absPath) {
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        res.setHeader('Content-Type', isPdf ? 'application/pdf' : (item.format ? `image/${item.format}` : 'application/octet-stream'));
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.title || 'document')}.${item.format || (isPdf ? 'pdf' : 'bin')}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(absPath);
      }
    }

    // Priority 2: Auto-fetch and cache via Cloudinary Admin signed archive API (bypasses all CDN 401 restrictions)
    if (isPdf && item.cloudinaryPublicId) {
      try {
        const cached = await fetchAndCacheCloudinaryRawAsset(item.cloudinaryPublicId, `${item.title || 'document'}.pdf`);
        if (cached && cached.absolutePath) {
          item.localPath = cached.relativePath;
          await item.save().catch(() => {});
          res.removeHeader('X-Frame-Options');
          res.setHeader('Content-Security-Policy', "frame-ancestors *");
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.title || 'document')}.pdf"`);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(cached.absolutePath);
        }
      } catch (cacheErr) {
        console.warn('[Cache On-Demand Failed]:', cacheErr.message);
      }
    }

    // Priority 2: Proxy stream from Cloudinary
    if (isPdf && (item.cloudinaryUrl || item.cloudinaryPublicId)) {
      const fetchUrls = [];

      if (item.cloudinaryPublicId) {
        const cleanPublicId = item.cloudinaryPublicId.replace(/\.pdf$/i, '');
        try {
          const privateRaw = cloudinary.utils.private_download_url(cleanPublicId, 'pdf', {
            resource_type: 'raw',
          });
          if (privateRaw) fetchUrls.push(privateRaw);
        } catch (e) {}

        try {
          const privateImage = cloudinary.utils.private_download_url(cleanPublicId, 'pdf', {
            resource_type: 'image',
          });
          if (privateImage) fetchUrls.push(privateImage);
        } catch (e) {}

        try {
          const signedRaw = cloudinary.url(item.cloudinaryPublicId, {
            resource_type: 'raw',
            sign_url: true,
            secure: true,
          });
          if (signedRaw) fetchUrls.push(signedRaw);
        } catch (e) {}
      }

      if (item.cloudinaryUrl) {
        fetchUrls.push(item.cloudinaryUrl);
      }

      for (const targetUrl of fetchUrls) {
        try {
          const response = await axios.get(targetUrl, {
            responseType: 'stream',
            timeout: 30000,
          });

          if (response.status === 200) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.title || 'document')}.pdf"`);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            return response.data.pipe(res);
          }
        } catch (streamErr) {
          // Try next candidate
        }
      }

      if (item.cloudinaryUrl) return res.redirect(item.cloudinaryUrl);
    }

    if (item.cloudinaryUrl) {
      return res.redirect(item.cloudinaryUrl);
    }

    if (item.url) {
      return res.redirect(item.url);
    }

    return res.status(404).json({ error: 'No file found for this item' });
  } catch (err) {
    console.error('getItemFile error:', err);
    if (!res.headersSent) sendError(res, err, 'Failed to retrieve file');
  }
};

// DELETE /api/spaces/:spaceId/items/:itemId
export const deleteItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const itemType = item.type;
    const itemTitle = item.title;

    // Clean local file if exists
    if (item.localPath) {
      await deleteLocalFile(item.localPath);
    }

    // Clean Cloudinary asset if exists
    if (item.cloudinaryPublicId) {
      const resourceType = (item.docType === 'pdf' || item.format === 'pdf') ? 'raw' : 'image';
      try {
        await deleteFromCloudinary(item.cloudinaryPublicId, resourceType);
      } catch (delErr) {
        console.error('Failed to delete asset from Cloudinary:', delErr);
      }
    }

    await Item.deleteOne({ _id: itemId, spaceId });

    // Decrement space count
    const countField = `${itemType}sCount`;
    if (space[countField] !== undefined && space[countField] > 0) {
      await updateSpaceResourceCount(spaceId, countField, -1);
    }

    await logUserHistory(
      req.user._id,
      `deleted_${itemType}`,
      `Deleted ${itemType} "${itemTitle}"`,
      { spaceId }
    );

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Failed to delete item');
  }
};
