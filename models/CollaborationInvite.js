import mongoose from "mongoose";

const CollaborationInviteSchema = new mongoose.Schema({
  space:   { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
  inviter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role:    { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
  status:  { type: String, enum: ['pending', 'accepted', 'declined', 'revoked'], default: 'pending', index: true },
}, { timestamps: true });

CollaborationInviteSchema.index({ space: 1, invitee: 1, status: 1 });
CollaborationInviteSchema.index({ invitee: 1, status: 1, createdAt: -1 });

export default mongoose.model('CollaborationInvite', CollaborationInviteSchema);
