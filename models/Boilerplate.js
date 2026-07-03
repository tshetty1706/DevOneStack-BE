import mongoose from "mongoose";

const BoilerplateSchema = new mongoose.Schema({
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:     { type: String, required: true, trim: true, maxLength: 80 },
  code:     { type: String, required: true, maxLength: 50000 },
  language: { type: String, required: true },
  stack:    { type: String },
  tags:     [{ type: String, trim: true }],
  isPinned: { type: Boolean, default: false },
  usedCount:{ type: Number, default: 0 },
  lastUsed: { type: Date },
}, { timestamps: true });

export default mongoose.model('Boilerplate', BoilerplateSchema);
