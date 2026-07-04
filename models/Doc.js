import mongoose from 'mongoose';
const { Schema } = mongoose;

const DocSchema = new Schema({
  owner:               { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  spaceId:             { type: Schema.Types.ObjectId, ref: 'Space', required: true },
  title:               { type: String, required: true, trim: true, maxLength: 120 },
  type:                { type: String, enum: ['url', 'pdf', 'image'], required: true },

  // For type: 'url'
  url:                 { type: String, trim: true },

  // For type: 'pdf' or 'image' — Cloudinary references
  cloudinaryPublicId:  { type: String },   // used for deletion and signed URL generation
  cloudinaryUrl:       { type: String },   // base delivery URL
  format:              { type: String },   // 'pdf', 'jpg', 'png', 'webp'
  fileSize:            { type: Number },   // bytes
  width:               { type: Number },   // images only
  height:              { type: Number },   // images only

  caption:             { type: String, maxLength: 300 },
  tags:                [{ type: String, trim: true, maxLength: 30 }],
  isPinned:            { type: Boolean, default: false },
}, { timestamps: true });

DocSchema.index({ owner: 1, spaceId: 1 });
DocSchema.index({ spaceId: 1, createdAt: -1 });
DocSchema.index({ spaceId: 1, tags: 1 });

export default mongoose.model('Doc', DocSchema);
