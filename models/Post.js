import mongoose from "mongoose";

const PostSchema = new mongoose.Schema({
  author:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text:          { type: String, required: true, maxlength: 500, trim: true },
  imageUrl:      { type: String, default: '' },
  space:         { type: mongoose.Schema.Types.ObjectId, ref: 'Space', default: null },
  likesCount:    { type: Number, default: 0, min: 0 },
  likedBy:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount: { type: Number, default: 0, min: 0 },
  isEdited:      { type: Boolean, default: false },
}, { timestamps: true });

PostSchema.index({ createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });

export default mongoose.model('Post', PostSchema);
