import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PromptSchema = new Schema({
  owner:     { type: ObjectId, ref: 'User', required: true, index: true },
  spaceId:   { type: ObjectId, ref: 'Space', required: true },
  title:     { type: String, required: true, trim: true, maxLength: 100 },
  body:      { type: String, required: true, maxLength: 5000 },
  caption:   { type: String, maxLength: 200 },
  tags:      [{ type: String, trim: true }],
  model:     { type: String, trim: true, maxLength: 50 },
  usedCount: { type: Number, default: 0 },
  isPinned:  { type: Boolean, default: false },
}, { timestamps: true });

PromptSchema.index({ owner: 1, spaceId: 1 });
PromptSchema.index({ spaceId: 1, createdAt: -1 });

export default mongoose.model('Prompt', PromptSchema);
