import mongoose from "mongoose";

const SpaceSchema = new mongoose.Schema({
  owner:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:             { type: String, required: true },
  icon:             { type: String },
  iconKey:          { type: String },
  language:         { type: String },
  tags:             [String],
  progress:         { type: Number, default: 0, min: 0, max: 100 },
  docsCount:        { type: Number, default: 0, min: 0 },
  notesCount:       { type: Number, default: 0, min: 0 },
  snippetsCount:    { type: Number, default: 0, min: 0 },
  reposCount:       { type: Number, default: 0, min: 0 },
  promptsCount:     { type: Number, default: 0, min: 0 },
  communitiesCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

SpaceSchema.index({ owner: 1, updatedAt: -1 });

export default mongoose.model('Space', SpaceSchema);
