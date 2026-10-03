import Item from '../models/Item.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

const detectPlatform = (url = '') => {
  const lower = url.toLowerCase();
  if (lower.includes('discord.gg') || lower.includes('discord.com')) return 'discord';
  if (lower.includes('reddit.com')) return 'reddit';
  if (lower.includes('slack.com')) return 'slack';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('youtube.com')) return 'youtube';
  if (lower.includes('github.com')) return 'github';
  if (lower.includes('t.me')) return 'telegram';
  if (lower.includes('whatsapp.com')) return 'whatsapp';
  return 'other';
};

// GET /api/spaces/:spaceId/communities
export const listCommunities = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id, type: 'community' };
    if (lastId) filter._id = { $gt: lastId };
    if (tag) filter.tags = tag.toLowerCase().trim();

    const items = await Item.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .limit(50)
      .lean();

    const communities = items.map(i => ({
      _id: i._id,
      name: i.title,
      title: i.title,
      url: i.url,
      platform: i.platform || 'other',
      caption: i.caption,
      memberCount: i.memberCount,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ communities, hasMore: items.length === 50 });
  } catch (err) {
    sendError(res, err, 'Failed to load communities');
  }
};

// POST /api/spaces/:spaceId/communities
export const createCommunity = async (req, res) => {
  try {
    const { name, title, url, platform, caption, tags = [], memberCount, folderId } = req.body;
    const { spaceId } = req.params;

    const commTitle = (title || name || '').trim();
    if (!commTitle) return res.status(400).json({ error: 'Community name/title is required' });
    if (!url) return res.status(400).json({ error: 'Community URL is required' });

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const detectedPlatform = platform || detectPlatform(url);

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: folderId || null,
      title: commTitle,
      type: 'community',
      url: url.trim(),
      platform: detectedPlatform,
      caption: caption?.trim() || '',
      memberCount: memberCount?.trim() || '',
      tags: parseTags(tags),
    });

    await updateSpaceResourceCount(spaceId, 'communitiesCount', 1);

    await logUserHistory(
      req.user._id,
      'created_community',
      `Added community link "${item.title}"`,
      { spaceId, communityId: item._id }
    );

    res.status(201).json({
      community: {
        _id: item._id,
        name: item.title,
        title: item.title,
        url: item.url,
        platform: item.platform,
        caption: item.caption,
        memberCount: item.memberCount,
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

// PATCH /api/spaces/:spaceId/communities/:id
export const updateCommunity = async (req, res) => {
  try {
    const { name, title, url, platform, caption, tags, memberCount, folderId } = req.body;
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'community' });
    if (!item) return res.status(404).json({ error: 'Community not found' });

    if (name !== undefined || title !== undefined) item.title = (title || name).trim();
    if (caption !== undefined) item.caption = caption.trim();
    if (memberCount !== undefined) item.memberCount = memberCount.trim();
    if (tags !== undefined) item.tags = parseTags(tags);
    if (folderId !== undefined) item.folderId = (folderId && folderId !== 'root') ? folderId : null;

    if (url !== undefined) {
      item.url = url.trim();
      if (platform === undefined) {
        item.platform = detectPlatform(url.trim());
      } else {
        item.platform = platform;
      }
    } else if (platform !== undefined) {
      item.platform = platform;
    }

    await item.save();

    res.json({
      community: {
        _id: item._id,
        name: item.title,
        title: item.title,
        url: item.url,
        platform: item.platform,
        caption: item.caption,
        memberCount: item.memberCount,
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

// DELETE /api/spaces/:spaceId/communities/:id
export const deleteCommunity = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOneAndDelete({ _id: id, spaceId, owner: req.user._id, type: 'community' });
    if (!item) return res.status(404).json({ error: 'Community not found' });

    await updateSpaceResourceCount(spaceId, 'communitiesCount', -1);

    res.json({ message: 'Community link removed' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/communities/search?q=
export const searchCommunities = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const items = await Item.find({
      spaceId,
      owner: req.user._id,
      type: 'community',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { url: { $regex: q, $options: 'i' } },
        { platform: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ]
    }).limit(20).lean();

    const communities = items.map(i => ({
      _id: i._id,
      name: i.title,
      title: i.title,
      url: i.url,
      platform: i.platform || 'other',
      caption: i.caption,
      memberCount: i.memberCount,
      tags: i.tags,
      isPinned: i.isPinned,
      folderId: i.folderId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json({ communities, count: communities.length });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/communities/:id/pin
export const togglePin = async (req, res) => {
  try {
    const { spaceId, id } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: id, spaceId, owner: req.user._id, type: 'community' });
    if (!item) return res.status(404).json({ error: 'Community not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err);
  }
};

