import InboxItem from "../models/InboxItem.js";

export const getInboxItems = async (req, res) => {
  try {
    const items = await InboxItem.find({ owner: req.user._id }).sort("-createdAt");
    return res.json(items);
  } catch (err) {
    console.error("getInboxItems error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const createInboxItem = async (req, res) => {
  try {
    const { url, title, type, assignedStack } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const item = await InboxItem.create({
      url,
      title: title || "",
      type: type || "Link",
      assignedStack: assignedStack || null,
      owner: req.user._id,
    });

    return res.status(201).json(item);
  } catch (err) {
    console.error("createInboxItem error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const updateInboxItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, assignedStack } = req.body;

    const updateFields = {};
    if (title !== undefined) updateFields.title = title;
    if (assignedStack !== undefined) updateFields.assignedStack = assignedStack;

    const item = await InboxItem.findOneAndUpdate(
      { _id: id, owner: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json(item);
  } catch (err) {
    console.error("updateInboxItem error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};

export const deleteInboxItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await InboxItem.findOneAndDelete({ _id: id, owner: req.user._id });
    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json({ message: "Item deleted successfully" });
  } catch (err) {
    console.error("deleteInboxItem error:", err);
    return res.status(500).json({ error: "Something went wrong on our end. Try again shortly." });
  }
};
