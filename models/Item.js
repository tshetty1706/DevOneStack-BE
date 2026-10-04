import mongoose from 'mongoose';
const { Schema } = mongoose;

const ItemSchema = new Schema({
  owner:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  spaceId:     { type: Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
  folderId:    { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
  title:       { type: String, required: true, trim: true, maxLength: 200 },
  type:        {
    type: String,
    enum: ['note', 'doc', 'snippet', 'learning', 'prompt', 'repo', 'image', 'community'],
    required: true,
    index: true
  },
  content:     { type: String, default: '' },
  preview:     { type: String, default: '', maxLength: 400 },
  caption:     { type: String, default: '', maxLength: 300 },
  tags:        [{ type: String, trim: true, maxLength: 50 }],
  isPinned:    { type: Boolean, default: false },

  // Specific content attributes
  docType:     { type: String, enum: ['url', 'pdf', 'image', 'markdown'], default: 'markdown' },
  learningType:{ type: String, enum: ["learning", "fix", "gotcha", "best-practice", "question", "idea"], default: "learning" },
  language:    { type: String, default: 'javascript', trim: true },
  codeExample: {
    language:  { type: String, trim: true },
    code:      { type: String }
  },
  url:         { type: String, trim: true },
  repoName:    { type: String, trim: true },
  starsCount:  { type: Number, default: 0 },
  forksCount:  { type: Number, default: 0 },
  isOwn:       { type: Boolean, default: false },
  model:       { type: String, trim: true, maxLength: 50 },
  usedCount:   { type: Number, default: 0 },
  lastUsed:    { type: Date },

  // Community attributes
  platform:    { type: String, trim: true, default: 'other' },
  memberCount: { type: String, trim: true, maxLength: 50 },
  credentials: { type: String, default: '' },

  // Cloudinary references (for PDFs and Images)
  cloudinaryPublicId: { type: String },
  cloudinaryUrl:      { type: String },
  format:             { type: String },
  fileSize:           { type: Number },
  width:              { type: Number },
  height:             { type: Number },

  // Local storage persistence reference
  localPath:          { type: String },
}, { timestamps: true });

ItemSchema.index({ spaceId: 1, type: 1, folderId: 1 });
ItemSchema.index({ spaceId: 1, folderId: 1, isPinned: -1, updatedAt: -1 });
ItemSchema.index({ spaceId: 1, type: 1, isPinned: -1, updatedAt: -1 });
ItemSchema.index({ spaceId: 1, tags: 1 });
ItemSchema.index({ owner: 1, updatedAt: -1 });

export default mongoose.model('Item', ItemSchema);
