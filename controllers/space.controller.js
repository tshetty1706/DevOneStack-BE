import Space from "../models/Space.js";
import History from "../models/History.js";

export const getSpaces = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const spaces = await Space.find({ owner: ownerId }).sort("-createdAt");
    return res.json(spaces);
  } catch (err) {
    console.error("getSpaces error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const getSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const space = await Space.findOne({ _id: id, owner: req.user._id });
    if (!space) {
      return res.status(404).json({ error: "Space not found" });
    }
    return res.json(space);
  } catch (err) {
    console.error("getSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const createSpace = async (req, res) => {
  try {
    const { name, tags } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Space name is required" });
    }

    // Determine icon based on name
    const lowerName = name.toLowerCase();
    let icon = 'code';
    if (lowerName.includes('react')) icon = 'react';
    else if (lowerName.includes('docker')) icon = 'docker';
    else if (lowerName.includes('node')) icon = 'nodejs';
    else if (lowerName.includes('mongo')) icon = 'mongodb';
    else if (lowerName.includes('python')) icon = 'python';
    else if (lowerName.includes('kube') || lowerName.includes('k8s')) icon = 'kubernetes';
    else if (lowerName.includes('aws') || lowerName.includes('amazon')) icon = 'aws';
    else if (lowerName.includes('go')) icon = 'go';
    else if (lowerName.includes('rust')) icon = 'rust';
    else if (lowerName.includes('tailwind')) icon = 'tailwind';

    // Parse tags if it's a comma-separated string
    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags;
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    const space = await Space.create({
      owner: req.user._id,
      name,
      icon,
      tags: parsedTags,
      progress: 0,
      docsCount: 0,
      notesCount: 0,
      snippetsCount: 0,
      reposCount: 0,
      promptsCount: 0,
      communitiesCount: 0
    });

    // Log to history
    await History.create({
      owner: req.user._id,
      action: 'created_space',
      label: `Created space "${name}"`,
      meta: { spaceId: space._id, spaceName: name, tags: parsedTags },
    });

    return res.status(201).json(space);
  } catch (err) {
    console.error("createSpace error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};
