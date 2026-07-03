import mongoose from "mongoose";

const InboxItemSchema = new mongoose.Schema({
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  url:      { type: String, required: true, trim: true },
  title:    { type: String, default: '' },
  type:     { type: String, enum: ['YouTube','GitHub','Notion','Link'], default: 'Link' },
  assignedStack: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', default: null },
}, { timestamps: true });

export default mongoose.model('InboxItem', InboxItemSchema);
