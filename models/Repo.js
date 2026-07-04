import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const RepoSchema = new Schema({
  owner:    { type: ObjectId, ref: 'User', required: true, index: true },
  spaceId:  { type: ObjectId, ref: 'Space', required: true },
  name:     { type: String, required: true, trim: true, maxLength: 100 },
  url:      { type: String, required: true, trim: true },
  caption:  { type: String, maxLength: 200 },
  platform: { type: String, enum: ['github','gitlab','bitbucket','other'], default: 'github' },
  tags:     [{ type: String, trim: true }],
  isOwn:    { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
}, { timestamps: true });

RepoSchema.index({ owner: 1, spaceId: 1 });
RepoSchema.index({ spaceId: 1, createdAt: -1 });

export default mongoose.model('Repo', RepoSchema);
