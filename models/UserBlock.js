import mongoose from "mongoose";

const UserBlockSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  blockedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

UserBlockSchema.index({ user: 1, blockedUser: 1 }, { unique: true });

export default mongoose.model('UserBlock', UserBlockSchema);
