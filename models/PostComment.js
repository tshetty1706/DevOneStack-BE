import mongoose from "mongoose";

const PostCommentSchema = new mongoose.Schema({
  post:    { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:    { type: String, required: true, maxlength: 500, trim: true },
}, { timestamps: true });

PostCommentSchema.index({ post: 1, createdAt: 1 });

export default mongoose.model('PostComment', PostCommentSchema);
