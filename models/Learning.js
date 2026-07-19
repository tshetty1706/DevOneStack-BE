import mongoose from 'mongoose';
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const LearningSchema = new Schema({
  owner:       { type: ObjectId, ref: 'User', required: true, index: true },
  spaceId:     { type: ObjectId, ref: 'Space', required: true },
  title:       { type: String, required: true, trim: true, maxLength: 120 },
  type:        { 
    type: String, 
    enum: ["learning", "fix", "gotcha", "best-practice", "question", "idea"], 
    default: "learning",
    required: true 
  },
  content:     { type: String, required: true, trim: true },
  codeExample: {
    language:  { type: String, trim: true },
    code:      { type: String }
  },
  tags:        [{ type: String, trim: true, maxLength: 30 }],
  isPinned:    { type: Boolean, default: false }
}, { timestamps: true });

LearningSchema.index({ owner: 1, spaceId: 1 });
LearningSchema.index({ spaceId: 1, type: 1 });
LearningSchema.index({ spaceId: 1, updatedAt: -1 });
LearningSchema.index({ spaceId: 1, tags: 1 });

export default mongoose.model('Learning', LearningSchema);
