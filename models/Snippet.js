import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const SnippetSchema = new Schema({
  owner:     { type: ObjectId, ref: 'User', required: true, index: true },
  spaceId:   { type: ObjectId, ref: 'Space', required: true },
  name:      { type: String, required: true, trim: true, maxLength: 80 },
  caption:   { type: String, maxLength: 200 },
  language:  { type: String, required: true, trim: true },
  preview:   { type: String, maxLength: 150 },
  lineCount: { type: Number, default: 0 },
  tags:      [{ type: String, trim: true }],
  isPinned:  { type: Boolean, default: false },
  usedCount: { type: Number, default: 0 },
  lastUsed:  { type: Date },
}, { timestamps: true });

SnippetSchema.index({ owner: 1, spaceId: 1 });
SnippetSchema.index({ spaceId: 1, isPinned: -1, updatedAt: -1 });

export default mongoose.model('Snippet', SnippetSchema);
