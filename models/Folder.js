import mongoose from 'mongoose';
const { Schema } = mongoose;

const FolderSchema = new Schema({
  owner:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  spaceId:  { type: Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
  name:     { type: String, required: true, trim: true, maxLength: 100 },
  parentId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
  color:    { type: String, default: '' },
  order:    { type: Number, default: 0 },
  isRoot:   { type: Boolean, default: false },
}, { timestamps: true });

FolderSchema.index({ spaceId: 1, parentId: 1, name: 1 });
FolderSchema.index({ spaceId: 1, name: 1 });
FolderSchema.index({ spaceId: 1, isRoot: 1 });

export default mongoose.model('Folder', FolderSchema);
