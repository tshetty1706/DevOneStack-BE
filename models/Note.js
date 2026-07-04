import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const NoteSchema = new Schema({
  owner:     { type: ObjectId, ref: 'User', required: true, index: true },
  spaceId:   { type: ObjectId, ref: 'Space', required: true },
  title:     { type: String, required: true, trim: true, maxLength: 120 },
  preview:   { type: String, maxLength: 200 }, // auto-generated
  tags:      [{ type: String, trim: true, maxLength: 30 }],
  isPinned:  { type: Boolean, default: false },
  wordCount: { type: Number, default: 0 },
  mentions:  [{ type: ObjectId, ref: 'Note' }],
}, { timestamps: true });

NoteSchema.index({ owner: 1, spaceId: 1 });
NoteSchema.index({ spaceId: 1, updatedAt: -1 });
NoteSchema.index({ spaceId: 1, tags: 1 });

export default mongoose.model('Note', NoteSchema);
