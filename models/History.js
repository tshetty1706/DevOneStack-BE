import mongoose from "mongoose";

const HistorySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true },   // e.g. "created_space"
  label:  { type: String, required: true },   // Human-readable: "Created space React"
  meta:   { type: mongoose.Schema.Types.Mixed, default: {} }, // extra info (spaceId, spaceName, etc.)
}, { timestamps: true });

export default mongoose.model('History', HistorySchema);
