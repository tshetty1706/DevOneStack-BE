import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const NoteContentSchema = new Schema({
  noteId:      { type: ObjectId, ref: 'Note', required: true, unique: true },
  body:        { type: String, default: "", maxLength: 500000 }, // 500KB max
  lastEditedAt:{ type: Date, default: Date.now },
});

export default mongoose.model('NoteContent', NoteContentSchema);
