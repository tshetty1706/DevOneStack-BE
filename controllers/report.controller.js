import Report from "../models/Report.js";
import UserBlock from "../models/UserBlock.js";

/**
 * POST /api/reports
 * Submit a report for post, comment, space, or user.
 */
export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, details } = req.body;
    const reporter = req.user._id;

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ error: "Target type, target ID, and reason are required." });
    }

    const report = await Report.create({
      reporter,
      targetType,
      targetId,
      reason: String(reason).trim(),
      details: String(details || '').trim()
    });

    return res.status(201).json({ message: "Thank you for your report. Our team will review it.", report });
  } catch (err) {
    console.error("createReport error:", err);
    return res.status(500).json({ error: "Failed to submit report." });
  }
};

/**
 * POST /api/reports/block/:userId
 */
export const blockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const targetUserId = req.params.userId;

    if (userId.toString() === targetUserId.toString()) {
      return res.status(400).json({ error: "You cannot block yourself." });
    }

    await UserBlock.findOneAndUpdate(
      { user: userId, blockedUser: targetUserId },
      { user: userId, blockedUser: targetUserId },
      { upsert: true, new: true }
    );

    return res.json({ message: "User blocked." });
  } catch (err) {
    console.error("blockUser error:", err);
    return res.status(500).json({ error: "Failed to block user." });
  }
};

/**
 * POST /api/reports/unblock/:userId
 */
export const unblockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const targetUserId = req.params.userId;

    await UserBlock.findOneAndDelete({ user: userId, blockedUser: targetUserId });
    return res.json({ message: "User unblocked." });
  } catch (err) {
    console.error("unblockUser error:", err);
    return res.status(500).json({ error: "Failed to unblock user." });
  }
};
