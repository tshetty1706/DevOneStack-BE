import Item from '../models/Item.js';
import uploadToCloudinary from '../utils/uploadToCloudinary.js';
import deleteFromCloudinary from '../utils/deleteFromCloudinary.js';
import { saveFileLocally, deleteLocalFile, getLocalFilePath, fetchAndCacheCloudinaryRawAsset } from '../utils/fileStorage.js';
import axios from 'axios';
import cloudinary from '../config/cloudinary.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

// GET /api/spaces/:spaceId/docs
export const listDocs = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id, type: { $in: ['doc', 'image'] } };
    if (lastId) filter._id = { $gt: lastId };
    if (tag) filter.tags = tag.toLowerCase().trim();

    const items = await Item.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const docs = items.map(i => ({
      _id: i._id,
      title: i.title,
      type: i.docType || i.type,
      url: i.url,
      cloudinaryPublicId: i.cloudinaryPublicId,
      cloudinaryUrl: i.cloudinaryUrl,
      format: i.format,
      fileSize: i.fileSize,
      width: i.width,
      height: i.height,
      caption: i.caption,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ docs, hasMore: items.length === 50 });
  } catch (err) {
    sendError(res, err, 'Failed to load docs');
  }
};

// POST /api/spaces/:spaceId/docs/url
export const addUrlDoc = async (req, res) => {
  try {
    const { title, url, caption, tags, folderId } = req.body;
    const { spaceId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: folderId || null,
      title: title.trim(),
      type: 'doc',
      docType: 'url',
      url: url.trim(),
      caption: caption?.trim() || '',
      tags: parseTags(tags),
    });

    await updateSpaceResourceCount(spaceId, 'docsCount', 1);

    await logUserHistory(
      req.user._id,
      'created_doc',
      `Added url doc "${item.title}"`,
      { spaceId, docId: item._id }
    );

    res.status(201).json({
      doc: {
        _id: item._id,
        title: item.title,
        type: 'url',
        url: item.url,
        caption: item.caption,
        tags: item.tags,
        isPinned: item.isPinned,
        folderId: item.folderId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    });
  } catch (err) {
    sendError(res, err);
  }
};

// POST /api/spaces/:spaceId/docs/upload
export const uploadDoc = async (req, res) => {
  let uploadedCloudinaryPublicId = null;
  let uploadedResourceType = 'image';

  try {
    const { spaceId } = req.params;
    const { title, caption, tags, folderId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const isPdf = file.mimetype === 'application/pdf' || file.originalname?.toLowerCase().endsWith('.pdf');
    const isImage = file.mimetype?.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(file.originalname || '');
    const resourceType = isPdf ? 'raw' : 'image';
    uploadedResourceType = resourceType;

    let parsedTags = tags;
    if (typeof tags === 'string') {
      try { parsedTags = JSON.parse(tags); } catch { parsedTags = []; }
    }

    const fileExt = file.originalname.substring(file.originalname.lastIndexOf('.')) || (isPdf ? '.pdf' : '.jpg');
    const cleanOrigName = file.originalname.substring(0, file.originalname.lastIndexOf('.'))
      .replace(/[^a-zA-Z0-9]/g, '_') || 'doc';
    const customPublicId = isPdf
      ? `${cleanOrigName}-${Date.now()}${fileExt}`
      : `${cleanOrigName}-${Date.now()}`;

    const localSave = await saveFileLocally(file.buffer, file.originalname, isPdf ? 'documents' : 'images');

    let cloudinaryResult = null;
    try {
      cloudinaryResult = await uploadToCloudinary(file.buffer, {
        folder: `devonestack/${req.user._id}/${spaceId}`,
        resource_type: resourceType,
        public_id: customPublicId,
      });
      uploadedCloudinaryPublicId = cloudinaryResult?.public_id;
    } catch (uploadErr) {
      console.warn("[Doc Upload Warning] Cloudinary upload warning (using local file fallback):", uploadErr.message);
    }

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: (folderId && folderId !== 'root') ? folderId : null,
      title: title?.trim() || file.originalname,
      type: isPdf ? 'doc' : (isImage ? 'image' : 'doc'),
      docType: isPdf ? 'pdf' : (isImage ? 'image' : 'doc'),
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

    await updateSpaceResourceCount(spaceId, isPdf ? 'docsCount' : 'imagesCount', 1);

    await logUserHistory(
      req.user._id,
      'created_doc',
      `Uploaded doc "${item.title}"`,
      { spaceId, docId: item._id }
    );

    res.status(201).json({
      doc: {
        _id: item._id,
        title: item.title,
        type: item.docType,
        cloudinaryUrl: item.cloudinaryUrl,
        cloudinaryPublicId: item.cloudinaryPublicId,
        format: item.format,
        fileSize: item.fileSize,
        caption: item.caption,
        tags: item.tags,
        isPinned: item.isPinned,
        folderId: item.folderId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      item
    });
  } catch (err) {
    if (uploadedCloudinaryPublicId) {
      try {
        await deleteFromCloudinary(uploadedCloudinaryPublicId, uploadedResourceType);
      } catch (cleanErr) {
        console.error('[Doc Upload Rollback Error]', cleanErr);
      }
    }
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/docs/:docId/file
export const getDocFile = async (req, res) => {
  try {
    const { spaceId, docId } = req.params;
    const item = await Item.findOne({ _id: docId, spaceId });
    if (!item) return res.status(404).json({ error: 'Not found' });

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
        console.warn('[Doc Cache On-Demand Failed]:', cacheErr.message);
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

    return res.status(404).json({ error: 'No file found' });
  } catch (err) {
    console.error('getDocFile error:', err);
    if (!res.headersSent) sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/docs/:docId
export const updateDoc = async (req, res) => {
  try {
    const { title, caption, tags, isPinned, folderId } = req.body;
    const item = await Item.findOne({ _id: req.params.docId, owner: req.user._id });
    if (!item) return res.status(404).json({ error: 'Not found' });

    if (title !== undefined) item.title = title.trim();
    if (caption !== undefined) item.caption = caption.trim();
    if (tags !== undefined) item.tags = parseTags(tags);
    if (isPinned !== undefined) item.isPinned = isPinned;
    if (folderId !== undefined) item.folderId = (folderId && folderId !== 'root') ? folderId : null;

    await item.save();

    res.json({
      doc: {
        _id: item._id,
        title: item.title,
        type: item.docType || item.type,
        cloudinaryUrl: item.cloudinaryUrl,
        format: item.format,
        fileSize: item.fileSize,
        caption: item.caption,
        tags: item.tags,
        isPinned: item.isPinned,
        folderId: item.folderId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    });
  } catch (err) {
    sendError(res, err);
  }
};

// DELETE /api/spaces/:spaceId/docs/:docId
export const deleteDoc = async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({
      _id: req.params.docId,
      owner: req.user._id,
    });
    if (!item) return res.status(404).json({ error: 'Not found' });

    if (item.localPath) {
      await deleteLocalFile(item.localPath);
    }

    if (item.cloudinaryPublicId) {
      const resourceType = (item.docType === 'pdf' || item.type === 'pdf') ? 'raw' : 'image';
      try {
        await deleteFromCloudinary(item.cloudinaryPublicId, resourceType);
      } catch (delErr) {
        console.error('Failed to delete from Cloudinary:', delErr);
      }
    }

    await updateSpaceResourceCount(item.spaceId, item.type === 'image' ? 'imagesCount' : 'docsCount', -1);

    res.json({ message: 'Deleted' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/docs/search?q=
export const searchDocs = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const items = await Item.find({
      spaceId,
      owner: req.user._id,
      type: { $in: ['doc', 'image'] },
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ]
    }).limit(20).lean();

    res.json({ docs: items, count: items.length });
  } catch (err) {
    sendError(res, err);
  }
};
