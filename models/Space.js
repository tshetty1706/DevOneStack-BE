import mongoose from "mongoose";

const SpaceSchema = new mongoose.Schema({
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:     { type: String, required: true },
  language: { type: String },
  tags:     [String],
  progress: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });

export default mongoose.model('Space', SpaceSchema);
