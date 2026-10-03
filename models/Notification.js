import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type:      { type: String, enum: ['request', 'invitation', 'notification'], required: true, index: true },
  category:  {
    type: String,
    enum: [
      'clone_request',
      'collab_invite',
      'new_follower',
      'post_like',
      'post_comment',
      'space_starred',
      'clone_completed',
      'request_accepted',
      'request_rejected',
      'invite_accepted',
      'invite_declined',
      'general'
    ],
    required: true
  },
  read:      { type: Boolean, default: false, index: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

NotificationSchema.index({ recipient: 1, type: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, createdAt: -1 });

export default mongoose.model('Notification', NotificationSchema);
