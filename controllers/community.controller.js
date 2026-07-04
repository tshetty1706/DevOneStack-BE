import Community from '../models/Community.js';
import Space from '../models/Space.js';
import History from '../models/History.js';

const detectPlatform = (url) => {
  if (/discord\.(gg|com)/.test(url))     return 'discord';
  if (/reddit\.com/.test(url))           return 'reddit';
  if (/(twitter|x)\.com/.test(url))      return 'twitter';
  if (/youtube\.com/.test(url))          return 'youtube';
  if (/github\.com/.test(url))           return 'github';
  if (/slack\.com/.test(url))            return 'slack';
  return 'other';
};

// GET /api/spaces/:spaceId/communities
export const listCommunities = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const communities = await Community.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ communities, hasMore: communities.length === 20 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load communities' });
  }
};

// POST /api/spaces/:spaceId/communities
export const createCommunity = async (req, res) => {
  try {
    const { name, url, platform, caption, tags = [], memberCount } = req.body;
    const { spaceId } = req.params;

    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const detectedPlatform = platform || detectPlatform(url);

    const community = await Community.create({
      owner: req.user._id,
      spaceId,
      name: name.trim(),
      url: url.trim(),
      platform: detectedPlatform,
      caption: caption?.trim(),
      tags: tags.map(t => t.trim().toLowerCase()),
      memberCount: memberCount?.trim(),
    });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { communitiesCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_community',
      label: `Added community link "${community.name}"`,
      meta: { spaceId, communityId: community._id }
    });

    res.status(201).json({ community });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/communities/:id
export const updateCommunity = async (req, res) => {
  try {
    const { name, url, platform, caption, tags, memberCount } = req.body;
    const update = {};
    if (name !== undefined)        update.name = name.trim();
    if (caption !== undefined)     update.caption = caption.trim();
    if (platform !== undefined)    update.platform = platform;
    if (memberCount !== undefined) update.memberCount = memberCount.trim();
    if (tags !== undefined)        update.tags = tags.map(t => t.trim().toLowerCase());

    if (url !== undefined) {
      update.url = url.trim();
      if (platform === undefined) {
        update.platform = detectPlatform(url.trim());
      }
    }

    const community = await Community.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      update,
      { new: true }
    );
    if (!community) return res.status(404).json({ error: 'Community not found' });

    res.json({ community });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/spaces/:spaceId/communities/:id
export const deleteCommunity = async (req, res) => {
  try {
    const community = await Community.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });
    if (!community) return res.status(404).json({ error: 'Not found' });

    await Space.findOneAndUpdate(
      { _id: community.spaceId, owner: req.user._id, communitiesCount: { $gt: 0 } },
      { $inc: { communitiesCount: -1 } }
    );

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/communities/search?q=
export const searchCommunities = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const communities = await Community.find({
      spaceId,
      owner: req.user._id,
      $or: [
        { name:    { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags:    { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ communities, count: communities.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
