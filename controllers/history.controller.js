import History from "../models/History.js";

export const getHistory = async (req, res) => {
  try {
    const history = await History.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    return res.json(history);
  } catch (err) {
    console.error("getHistory error:", err);
    return res.status(500).json({ error: "Something went wrong on our end." });
  }
};
