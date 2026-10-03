import mongoose from "mongoose";

const CloneRequestSchema = new mongoose.Schema({
  space:        { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
  owner:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requester:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message:      { type: String, maxlength: 300, default: '', trim: true },
  status:       {
    type: String,
    enum: ['pending', 'accepted', 'completed', 'rejected', 'withdrawn', 'expired', 'revoked'],
    default: 'pending',
    index: true
  },
  permissions: {
    allowPublishing:   { type: Boolean, default: false },
    allowCollaborators:{ type: Boolean, default: false },
    allowOthersToClone:{ type: Boolean, default: false }
  },
  expiresAt:              { type: Date, required: true },
  acceptedAt:             { type: Date, default: null },
  rejectedCount:          { type: Number, default: 0 },
  isBlocked:              { type: Boolean, default: false },
  rejectionCooldownUntil: { type: Date, default: null },
}, { timestamps: true });

CloneRequestSchema.index({ space: 1, requester: 1 });
CloneRequestSchema.index({ owner: 1, status: 1, createdAt: -1 });
CloneRequestSchema.index({ requester: 1, status: 1, createdAt: -1 });

export default mongoose.model('CloneRequest', CloneRequestSchema);
