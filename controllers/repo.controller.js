import Repo from '../models/Repo.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError,
} from '../utils/spaceHelpers.js';

const VALID_REPO_URL = /^https?:\/\/(github|gitlab|bitbucket)\.com\/.+/;

// GET /api/spaces/:spaceId/repos
export const listRepos = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const repos = await Repo.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ repos, hasMore: repos.length === 20 });
  } catch (err) {
    sendError(res, err, 'Failed to load repositories');
  }
};

// POST /api/spaces/:spaceId/repos
export const createRepo = async (req, res) => {
  try {
    const { name, url, caption, platform, tags = [], isOwn = false } = req.body;
    const { spaceId } = req.params;

    if (!VALID_REPO_URL.test(url)) {
      return res.status(400).json({ error: 'Invalid repository URL. Must be github.com, gitlab.com or bitbucket.com' });
    }

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const repo = await Repo.create({
      owner: req.user._id,
      spaceId,
      name: name.trim(),
      url: url.trim(),
      caption: caption?.trim(),
      platform: platform || 'github',
      tags: parseTags(tags),
      isOwn,
    });

    await updateSpaceResourceCount(spaceId, 'reposCount', 1);

    await logUserHistory(
      req.user._id,
      'created_repo',
      `Linked repository "${repo.name}"`,
      { spaceId, repoId: repo._id }
    );

    res.status(201).json({ repo });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/spaces/:spaceId/repos/:id
export const updateRepo = async (req, res) => {
  try {
    const { name, url, caption, platform, tags, isOwn } = req.body;
    const update = {};
    if (name !== undefined)    update.name = name.trim();
    if (caption !== undefined) update.caption = caption.trim();
    if (platform !== undefined) update.platform = platform;
    if (tags !== undefined)     update.tags = parseTags(tags);
    if (isOwn !== undefined)   update.isOwn = isOwn;

    if (url !== undefined) {
      if (!VALID_REPO_URL.test(url)) {
        return res.status(400).json({ error: 'Invalid repository URL' });
      }
      update.url = url.trim();
    }

    const repo = await Repo.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      update,
      { new: true }
    );
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    res.json({ repo });
  } catch (err) {
    sendError(res, err);
  }
};

// DELETE /api/spaces/:spaceId/repos/:id
export const deleteRepo = async (req, res) => {
  try {
    const repo = await Repo.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });
    if (!repo) return res.status(404).json({ error: 'Not found' });

    await updateSpaceResourceCount(repo.spaceId, 'reposCount', -1);

    res.json({ message: 'Deleted' });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/spaces/:spaceId/repos/search?q=
export const searchRepos = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const repos = await Repo.find({
      spaceId,
      owner: req.user._id,
      $or: [
        { name:    { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags:    { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ repos, count: repos.length });
  } catch (err) {
    sendError(res, err);
  }
};
