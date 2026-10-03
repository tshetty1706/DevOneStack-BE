import mongoose from "mongoose";

const SpaceViewSchema = new mongoose.Schema({
  space:     { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
  viewerKey: { type: String, required: true }, // userId or hashed IP/session
  viewDate:  { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });

SpaceViewSchema.index({ space: 1, viewerKey: 1, viewDate: 1 }, { unique: true });
// TTL index: auto-expire records after 30 days
SpaceViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model('SpaceView', SpaceViewSchema);
