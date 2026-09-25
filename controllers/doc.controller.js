import Doc from '../models/Doc.js';
import uploadToCloudinary from '../utils/uploadToCloudinary.js';
import deleteFromCloudinary from '../utils/deleteFromCloudinary.js';
import { syncPinnedItem } from '../utils/pinSync.js';
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

    const filter = { spaceId, owner: req.user._id, isAttachment: { $ne: true } };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const docs = await Doc.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ docs, hasMore: docs.length === 20 });
  } catch (err) {
    sendError(res, err, 'Failed to load docs');
  }
};

// POST /api/spaces/:spaceId/docs/url
export const addUrlDoc = async (req, res) => {
  try {
    const { title, url, caption, tags } = req.body;
    const { spaceId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const doc = await Doc.create({
      owner:   req.user._id,
      spaceId,
      title:   title.trim(),
      type:    'url',
      url:     url.trim(),
      caption: caption?.trim(),
      tags:    parseTags(tags),
    });

    await updateSpaceResourceCount(spaceId, 'docsCount', 1);

    await logUserHistory(
      req.user._id,
      'created_doc',
      `Added url doc "${doc.title}"`,
      { spaceId, docId: doc._id }
    );

    res.status(201).json({ doc });
  } catch (err) {
    sendError(res, err);
  }
};

// POST /api/spaces/:spaceId/docs/upload
export const uploadDoc = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { title, caption, tags, isAttachment } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const isPdf = file.mimetype === 'application/pdf';

    const fileExt = file.originalname.substring(file.originalname.lastIndexOf('.'));
    const cleanOrigName = file.originalname.substring(0, file.originalname.lastIndexOf('.'))
      .replace(/[^a-zA-Z0-9]/g, '_');
    const customPublicId = `${cleanOrigName}-${Date.now()}${fileExt}`;

    // Upload buffer to Cloudinary
    let folder = `devonestack/${req.user._id}/${spaceId}`;
    let cloudinaryResult;
    try {
      cloudinaryResult = await uploadToCloudinary(file.buffer, {
        folder,
        public_id: customPublicId,
        resource_type: isPdf ? 'raw' : 'image',
      });
    } catch (uploadErr) {
      console.error("Cloudinary upload failed:", uploadErr);
      return res.status(500).json({ error: 'Cloudinary configuration is invalid or upload failed' });
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags);
      } catch (e) {
        parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      }
    }

    const doc = await Doc.create({
      owner:              req.user._id,
      spaceId,
      title:              title?.trim() || file.originalname,
      type:               isPdf ? 'pdf' : 'image',
      cloudinaryPublicId: cloudinaryResult.public_id,
      cloudinaryUrl:      cloudinaryResult.secure_url,
      format:             cloudinaryResult.format,
      fileSize:           cloudinaryResult.bytes,
      width:              cloudinaryResult.width  || null,
      height:             cloudinaryResult.height || null,
      caption:            caption?.trim(),
      tags:               parseTags(parsedTags),
      isAttachment:       isAttachment === 'true' || isAttachment === true,
    });

    if (!doc.isAttachment) {
      await updateSpaceResourceCount(spaceId, 'docsCount', 1);

      await logUserHistory(
        req.user._id,
        'created_doc',
        `Uploaded doc "${doc.title}"`,
        { spaceId, docId: doc._id }
      );
    }

    res.status(201).json({ doc });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/docs/:docId/file
export const getDocFile = async (req, res) => {
  try {
    const doc = await Doc.findOne({
      _id: req.params.docId,
      owner: req.user._id,
    });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // For URL type — just return the URL
    if (doc.type === 'url') {
      return res.json({ url: doc.url, type: 'url' });
    }

    // For images — return signed Cloudinary URL using private_download_url
    if (doc.type === 'image') {
      const signedUrl = cloudinary.utils.private_download_url(doc.cloudinaryPublicId, doc.format || 'jpg', {
        type:          'authenticated',
        resource_type: 'image',
        expires_at:    Math.floor(Date.now() / 1000) + 3600,
      });
      return res.json({ url: signedUrl, type: 'image' });
    }

    // For PDFs — stream through backend with inline header
    if (doc.type === 'pdf') {
      const fetchUrl = cloudinary.utils.private_download_url(doc.cloudinaryPublicId, doc.format || 'pdf', {
        type:          'authenticated',
        resource_type: 'raw',
        expires_at:    Math.floor(Date.now() / 1000) + 300,
      });

      const response = await axios.get(fetchUrl, {
        responseType: 'stream',
        timeout: 30000,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.title}.pdf"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      response.data.pipe(res);

      response.data.on('error', (err) => {
        console.error('PDF stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
    }
  } catch (err) {
    console.error('getDocFile error:', err);
    if (!res.headersSent) sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/docs/:docId
export const updateDoc = async (req, res) => {
  try {
    const { title, caption, tags, isPinned } = req.body;
    const update = {};
    if (title !== undefined)    update.title   = title.trim();
    if (caption !== undefined)  update.caption = caption.trim();
    if (tags !== undefined)     update.tags    = parseTags(tags);
    if (isPinned !== undefined) update.isPinned = isPinned;

    const doc = await Doc.findOneAndUpdate(
      { _id: req.params.docId, owner: req.user._id },
      update,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (isPinned !== undefined) {
      await syncPinnedItem(req.user._id, doc.spaceId, doc._id, 'doc', doc.isPinned, {
        name: doc.title,
        code: doc.type === 'url' ? doc.url : doc.cloudinaryUrl,
        language: doc.type,
        tags: doc.tags
      });
    }

    res.json({ doc });
  } catch (err) {
    sendError(res, err);
  }
};

// DELETE /api/spaces/:spaceId/docs/:docId
export const deleteDoc = async (req, res) => {
  try {
    const doc = await Doc.findOneAndDelete({
      _id: req.params.docId,
      owner: req.user._id,
    });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Sync pin removal
    await syncPinnedItem(req.user._id, doc.spaceId, doc._id, 'doc', false);

    // Delete from Cloudinary if it was a file upload
    if (doc.cloudinaryPublicId) {
      const resourceType = doc.type === 'pdf' ? 'raw' : 'image';
      try {
        await deleteFromCloudinary(doc.cloudinaryPublicId, resourceType);
      } catch (delErr) {
        console.error("Failed to delete from Cloudinary:", delErr);
      }
    }

    await updateSpaceResourceCount(doc.spaceId, 'docsCount', -1);

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

    const docs = await Doc.find({
      spaceId,
      owner: req.user._id,
      isAttachment: { $ne: true },
      $or: [
        { title:   { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags:    { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ docs, count: docs.length });
  } catch (err) {
    sendError(res, err);
  }
};
