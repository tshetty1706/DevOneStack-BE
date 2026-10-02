import Item from '../models/Item.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

// GET /api/spaces/:spaceId/repos
export const listRepos = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id, type: 'repo' };
    if (lastId) filter._id = { $gt: lastId };
    if (tag) filter.tags = tag.toLowerCase().trim();

    const items = await Item.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .limit(50)
      .lean();

    const repos = items.map(i => ({
      _id: i._id,
      name: i.title,
      title: i.title,
      url: i.url,
      caption: i.caption,
      platform: i.platform || 'github',
      isOwn: i.isOwn || false,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ repos, hasMore: items.length === 50 });
  } catch (err) {
    sendError(res, err, 'Failed to load repositories');
  }
};

// POST /api/spaces/:spaceId/repos
export const createRepo = async (req, res) => {
  try {
    const { name, title, url, caption, platform, tags = [], isOwn = false, folderId } = req.body;
    const { spaceId } = req.params;

    const repoTitle = (title || name || '').trim();
    if (!repoTitle) return res.status(400).json({ error: 'Repository name/title is required' });
    if (!url) return res.status(400).json({ error: 'Repository URL is required' });

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: folderId || null,
      title: repoTitle,
      repoName: repoTitle,
      type: 'repo',
      url: url.trim(),
      caption: caption?.trim() || '',
      platform: platform || 'github',
      isOwn: !!isOwn,
      tags: parseTags(tags),
    });

    await updateSpaceResourceCount(spaceId, 'reposCount', 1);

    await logUserHistory(
      req.user._id,
      'created_repo',
      `Linked repository "${item.title}"`,
      { spaceId, repoId: item._id }
    );

    res.status(201).json({
      repo: {
        _id: item._id,
        name: item.title,
        title: item.title,
        url: item.url,
        caption: item.caption,
        platform: item.platform,
        isOwn: item.isOwn,
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

// PATCH /api/spaces/:spaceId/repos/:id
export const updateRepo = async (req, res) => {
  try {
    const { name, title, url, caption, platform, tags, isOwn, folderId } = req.body;
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'repo' });
    if (!item) return res.status(404).json({ error: 'Repository not found' });

    if (name !== undefined || title !== undefined) {
      item.title = (title || name).trim();
      item.repoName = item.title;
    }
    if (url !== undefined) item.url = url.trim();
    if (caption !== undefined) item.caption = caption.trim();
    if (platform !== undefined) item.platform = platform;
    if (tags !== undefined) item.tags = parseTags(tags);
    if (isOwn !== undefined) item.isOwn = isOwn;
    if (folderId !== undefined) item.folderId = (folderId && folderId !== 'root') ? folderId : null;

    await item.save();

    res.json({
      repo: {
        _id: item._id,
        name: item.title,
        title: item.title,
        url: item.url,
        caption: item.caption,
        platform: item.platform,
        isOwn: item.isOwn,
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

// DELETE /api/spaces/:spaceId/repos/:id
export const deleteRepo = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOneAndDelete({ _id: id, spaceId, owner: req.user._id, type: 'repo' });
    if (!item) return res.status(404).json({ error: 'Repository not found' });

    await updateSpaceResourceCount(spaceId, 'reposCount', -1);

    res.json({ message: 'Repository connection deleted' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/repos/search?q=
export const searchRepos = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const items = await Item.find({
      spaceId,
      owner: req.user._id,
      type: 'repo',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { repoName: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { url: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ]
    }).limit(20).lean();

    const repos = items.map(i => ({
      _id: i._id,
      name: i.title,
      title: i.title,
      url: i.url,
      caption: i.caption,
      platform: i.platform || 'github',
      isOwn: i.isOwn || false,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ repos, count: repos.length });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/repos/:id/pin
export const togglePin = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'repo' });
    if (!item) return res.status(404).json({ error: 'Repository not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err);
  }
};

