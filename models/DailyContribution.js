import mongoose from 'mongoose';
const { Schema } = mongoose;

const DailyContributionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true, index: true }, // "YYYY-MM-DD" in UTC
  points: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  createsCount: { type: Number, default: 0 },
  editsCount: { type: Number, default: 0 },
  readsCount: { type: Number, default: 0 },

  // Track item IDs for daily deduplication
  createdItemIds: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
  editedItemIds: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
  readItemIds: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
}, { timestamps: true });

// Compound unique index ensuring 1 document per user per day
DailyContributionSchema.index({ user: 1, date: 1 }, { unique: true });
DailyContributionSchema.index({ user: 1, date: -1 });

export default mongoose.model('DailyContribution', DailyContributionSchema);
