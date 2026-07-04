import Prompt from '../models/Prompt.js';
import Space from '../models/Space.js';
import History from '../models/History.js';
import DOMPurify from 'isomorphic-dompurify';

// GET /api/spaces/:spaceId/prompts
export const listPrompts = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { lastId, tag } = req.query;

    const filter = { spaceId, owner: req.user._id };
    if (lastId) filter._id = { $gt: lastId };
    if (tag)    filter.tags = tag;

    const prompts = await Prompt.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ prompts, hasMore: prompts.length === 20 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load prompts' });
  }
};

// POST /api/spaces/:spaceId/prompts
export const createPrompt = async (req, res) => {
  try {
    const { title, body, caption, tags = [], model } = req.body;
    const { spaceId } = req.params;

    if (!body) return res.status(400).json({ error: 'Prompt body is required' });

    const space = await Space.findOne({ _id: spaceId, owner: req.user._id });
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const cleanBody = DOMPurify.sanitize(body);

    const prompt = await Prompt.create({
      owner: req.user._id,
      spaceId,
      title: title.trim(),
      body: cleanBody,
      caption: caption?.trim(),
      tags: tags.map(t => t.trim().toLowerCase()),
      model: model?.trim(),
    });

    await Space.findOneAndUpdate(
      { _id: spaceId, owner: req.user._id },
      { $inc: { promptsCount: 1 } }
    );

    await History.create({
      owner: req.user._id,
      action: 'created_prompt',
      label: `Saved prompt "${prompt.title}"`,
      meta: { spaceId, promptId: prompt._id }
    });

    res.status(201).json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/spaces/:spaceId/prompts/:id
export const updatePrompt = async (req, res) => {
  try {
    const { title, body, caption, tags, model } = req.body;
    const update = {};
    if (title !== undefined)   update.title = title.trim();
    if (body !== undefined)    update.body = DOMPurify.sanitize(body);
    if (caption !== undefined) update.caption = caption.trim();
    if (tags !== undefined)     update.tags = tags.map(t => t.trim().toLowerCase());
    if (model !== undefined)   update.model = model.trim();

    const prompt = await Prompt.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      update,
      { new: true }
    );
    if (!prompt) return res.status(404).json({ error: 'Prompt not found' });

    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/spaces/:spaceId/prompts/:id/use
export const usePrompt = async (req, res) => {
  try {
    await Prompt.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $inc: { usedCount: 1 } }
    );
    res.json({ message: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/spaces/:spaceId/prompts/:id
export const deletePrompt = async (req, res) => {
  try {
    const prompt = await Prompt.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });
    if (!prompt) return res.status(404).json({ error: 'Not found' });

    await Space.findOneAndUpdate(
      { _id: prompt.spaceId, owner: req.user._id, promptsCount: { $gt: 0 } },
      { $inc: { promptsCount: -1 } }
    );

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/spaces/:spaceId/prompts/search?q=
export const searchPrompts = async (req, res) => {
  try {
    const { q } = req.query;
    const { spaceId } = req.params;

    const prompts = await Prompt.find({
      spaceId,
      owner: req.user._id,
      $or: [
        { title:   { $regex: q, $options: 'i' } },
        { body:    { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags:    { $regex: q, $options: 'i' } },
      ]
    }).limit(20).select('-__v');

    res.json({ prompts, count: prompts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
