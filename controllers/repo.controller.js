import Repo from '../models/Repo.js';
import Space from '../models/Space.js';
import History from '../models/History.js';

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
    res.status(500).json({ error: 'Failed to load repositories' });
  }
};

// POST /api/spaces/:spaceId/repos
export const createRepo = async (req, res) => {
  try {
    const { name, url, caption, platform, tags = [], isOwn = false } = req.body;
    const { spaceId } = req.params;

    const validRepoUrl = /^https?:\/\/(github|gitlab|bitbucket)\.com\/.+/;
    if (!validRepoUrl.test(url)) {
      return res.status(400).json({ error: 'Invalid repository URL. Must be github.com, gitlab.com or bitbucket.com' });
    }

    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const repo = await Repo.create({
      owner: req.user._id,
      spaceId,
      name: name.trim(),
      url: url.trim(),
      caption: caption?.trim(),
      platform: platform || 'github',
      tags: tags.map(t => t.trim().toLowerCase()),
      isOwn,
    });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { reposCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_repo',
      label: `Linked repository "${repo.name}"`,
      meta: { spaceId, repoId: repo._id }
    });

    res.status(201).json({ repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (tags !== undefined)     update.tags = tags.map(t => t.trim().toLowerCase());
    if (isOwn !== undefined)   update.isOwn = isOwn;

    if (url !== undefined) {
      const validRepoUrl = /^https?:\/\/(github|gitlab|bitbucket)\.com\/.+/;
      if (!validRepoUrl.test(url)) {
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
    res.status(500).json({ error: err.message });
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

    await Space.findOneAndUpdate(
      { _id: repo.spaceId, owner: req.user._id, reposCount: { $gt: 0 } },
      { $inc: { reposCount: -1 } }
    );

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};
