import mongoose from "mongoose";

const SpaceSchema = new mongoose.Schema({
  owner:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:             { type: String, required: true, trim: true },
  description:      { type: String, default: '', trim: true, maxlength: 500 },
  tool:             { type: String, default: '', trim: true },
  thumbnail:        { type: String, default: '' },
  visibility:       { type: String, enum: ['public', 'private', 'unlisted'], default: 'private', index: true },
  starsCount:       { type: Number, default: 0, min: 0 },
  viewsCount:       { type: Number, default: 0, min: 0 },
  sharesCount:      { type: Number, default: 0, min: 0 },
  contributorsCount:{ type: Number, default: 1, min: 1 },
  starredBy:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  icon:             { type: String },
  iconKey:          { type: String },
  language:         { type: String },
  tags:             [String],
  progress:         { type: Number, default: 0, min: 0, max: 100 },
  docsCount:        { type: Number, default: 0, min: 0 },
  learningsCount:   { type: Number, default: 0, min: 0 },
  snippetsCount:    { type: Number, default: 0, min: 0 },
  reposCount:       { type: Number, default: 0, min: 0 },
  promptsCount:     { type: Number, default: 0, min: 0 },
  communitiesCount: { type: Number, default: 0, min: 0 },
  isPinned:         { type: Boolean, default: false },
  isArchived:       { type: Boolean, default: false }
}, { timestamps: true });

SpaceSchema.index({ owner: 1, isPinned: -1, updatedAt: -1 });
SpaceSchema.index({ visibility: 1, updatedAt: -1 });

export default mongoose.model('Space', SpaceSchema);

