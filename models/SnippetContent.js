import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const SnippetContentSchema = new Schema({
  snippetId: { type: ObjectId, ref: 'Snippet', required: true, unique: true },
  code:      { type: String, default: "", maxLength: 200000 },
});

export default mongoose.model('SnippetContent', SnippetContentSchema);
