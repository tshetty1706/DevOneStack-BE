import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CommunitySchema = new Schema({
  owner:       { type: ObjectId, ref: 'User', required: true, index: true },
  spaceId:     { type: ObjectId, ref: 'Space', required: true },
  name:        { type: String, required: true, trim: true, maxLength: 100 },
  url:         { type: String, required: true, trim: true },
  platform:    { type: String, enum: ['discord','reddit','slack','twitter','newsletter','youtube','github','other'] },
  caption:     { type: String, maxLength: 200 },
  tags:        [{ type: String, trim: true }],
  memberCount: { type: String, maxLength: 20 },
  isPinned:    { type: Boolean, default: false },
}, { timestamps: true });

CommunitySchema.index({ owner: 1, spaceId: 1 });

export default mongoose.model('Community', CommunitySchema);
