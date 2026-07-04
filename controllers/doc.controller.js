import Doc from '../models/Doc.js';
import Space from '../models/Space.js';
import History from '../models/History.js';
import uploadToCloudinary from '../utils/uploadToCloudinary.js';
import deleteFromCloudinary from '../utils/deleteFromCloudinary.js';
import getSignedUrl from '../utils/getSignedUrl.js';
import { syncPinnedItem } from '../utils/pinSync.js';

// GET /api/spaces/:spaceId/docs
export const listDocs = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const docs = await Doc.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ docs, hasMore: docs.length === 20 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load docs' });
  }
};

// POST /api/spaces/:spaceId/docs/url
export const addUrlDoc = async (req, res) => {
  try {
    const { title, url, caption, tags } = req.body;
    const { spaceId } = req.params;

    // Verify space ownership
    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const doc = await Doc.create({
      owner:   req.user._id,
      spaceId,
      title:   title.trim(),
      type:    'url',
      url:     url.trim(),
      caption: caption?.trim(),
      tags:    Array.isArray(tags) ? tags.map(t => t.trim().toLowerCase()) : [],
    });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { docsCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_doc',
      label: `Added url doc "${doc.title}"`,
      meta: { spaceId, docId: doc._id }
    });

    res.status(201).json({ doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/spaces/:spaceId/docs/upload
export const uploadDoc = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { title, caption, tags } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    // Verify space ownership before upload
    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
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
      tags:               parsedTags.map(t => t.trim().toLowerCase()),
    });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { docsCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_doc',
      label: `Uploaded doc "${doc.title}"`,
      meta: { spaceId, docId: doc._id }
    });

    res.status(201).json({ doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/docs/:docId/signed-url
export const getSignedDocUrl = async (req, res) => {
  try {
    const doc = await Doc.findOne({
      _id: req.params.docId,
      owner: req.user._id,
    });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (doc.type === 'url') return res.json({ url: doc.url });

    const resourceType = doc.type === 'pdf' ? 'raw' : 'image';
    let signedUrl;
    try {
      signedUrl = getSignedUrl(doc.cloudinaryPublicId, resourceType, 3600);
    } catch (signErr) {
      console.error("Cloudinary sign failed:", signErr);
      return res.status(500).json({ error: 'Failed to sign Cloudinary URL. Check API keys.' });
    }

    res.json({ url: signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/docs/:docId
export const updateDoc = async (req, res) => {
  try {
    const { title, caption, tags, isPinned } = req.body;
    const update = {};
    if (title !== undefined)    update.title   = title.trim();
    if (caption !== undefined)  update.caption = caption.trim();
    if (tags !== undefined)     update.tags    = tags.map(t => t.trim().toLowerCase());
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
    res.status(500).json({ error: err.message });
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

    await Space.findOneAndUpdate(
      { _id: doc.spaceId, owner: req.user._id, docsCount: { $gt: 0 } },
      { $inc: { docsCount: -1 } }
    );

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      $or: [
        { title:   { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags:    { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
