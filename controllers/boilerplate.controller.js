import Boilerplate from "../models/Boilerplate.js";

const DEFAULT_BOILERPLATES = [];

export const getBoilerplates = async (req, res) => {
  try {
    const filter = { owner: req.user._id };
    if (req.query.pinned === "true") {
      filter.isPinned = true;
    }

    // Check count and seed if zero
    const totalCount = await Boilerplate.countDocuments({ owner: req.user._id });
    if (totalCount === 0) {
      await Boilerplate.insertMany(
        DEFAULT_BOILERPLATES.map(b => ({ ...b, owner: req.user._id }))
      );
    }

    const boilerplates = await Boilerplate.find(filter).sort("-createdAt");
    return res.json(boilerplates);
  } catch (err) {
    console.error("getBoilerplates error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const createBoilerplate = async (req, res) => {
  try {
    const { name, code, language, stack, tags, isPinned } = req.body;
    if (!name || !code || !language) {
      return res.status(400).json({ error: "Name, code, and language are required" });
    }

    const boilerplate = await Boilerplate.create({
      name,
      code,
      language,
      stack: stack || "",
      tags: tags || [],
      isPinned: isPinned || false,
      owner: req.user._id,
    });

    return res.status(201).json(boilerplate);
  } catch (err) {
    console.error("createBoilerplate error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const updateBoilerplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, language, stack, tags, isPinned } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (code !== undefined) updateFields.code = code;
    if (language !== undefined) updateFields.language = language;
    if (stack !== undefined) updateFields.stack = stack;
    if (tags !== undefined) updateFields.tags = tags;
    if (isPinned !== undefined) updateFields.isPinned = isPinned;

    const boilerplate = await Boilerplate.findOneAndUpdate(
      { _id: id, owner: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!boilerplate) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json(boilerplate);
  } catch (err) {
    console.error("updateBoilerplate error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const deleteBoilerplate = async (req, res) => {
  try {
    const { id } = req.params;

    const boilerplate = await Boilerplate.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!boilerplate) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json({ message: "Boilerplate deleted successfully" });
  } catch (err) {
    console.error("deleteBoilerplate error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};
