import History from "../models/History.js";

export const getHistory = async (req, res) => {
  try {
    const { spaceId } = req.query;
    const filter = { owner: req.user._id };
    if (spaceId) {
      filter['meta.spaceId'] = spaceId;
    }
    const history = await History.find(filter)
      .sort({ createdAt: -1 })
      .limit(5);
    return res.json(history);
  } catch (err) {
    console.error("getHistory error:", err);
    return res.status(500).json({ error: "Something went wrong on our end." });
  }
};
