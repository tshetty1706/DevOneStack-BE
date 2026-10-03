import History from "../models/History.js";

export const getHistory = async (req, res) => {
  try {
    const { spaceId, limit } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    const filter = {};
    if (spaceId) {
      filter['meta.spaceId'] = spaceId;
    } else {
      filter.owner = req.user._id;
    }

    const history = await History.find(filter)
      .populate('owner', 'username displayName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

    return res.json(history);
  } catch (err) {
    console.error("getHistory error:", err);
    return res.status(500).json({ error: "Something went wrong on our end." });
  }
};
