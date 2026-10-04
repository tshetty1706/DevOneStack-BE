import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema({
  reporter:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['post', 'comment', 'space', 'user'], required: true },
  targetId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  reason:     { type: String, required: true, maxlength: 200, trim: true },
  details:    { type: String, default: '', maxlength: 500, trim: true },
  status:     { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending' },
}, { timestamps: true });

export default mongoose.model('Report', ReportSchema);
