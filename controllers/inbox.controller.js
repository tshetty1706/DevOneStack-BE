import Notification from "../models/Notification.js";
import CloneRequest from "../models/CloneRequest.js";
import CollaborationInvite from "../models/CollaborationInvite.js";
import Space from "../models/Space.js";
import User from "../models/User.js";
import { createInboxNotification } from "../utils/notificationService.js";

/**
 * GET /api/inbox/unread-count
 * Returns unread counts across all three tabs.
 */
export const getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user._id;

    const [requestsCount, invitationsCount, notificationsCount] = await Promise.all([
      // Pending requests received where user is space owner
      CloneRequest.countDocuments({ owner: userId, status: 'pending' }),
      // Pending collaboration invites where user is invitee
      CollaborationInvite.countDocuments({ invitee: userId, status: 'pending' }),
      // Unread notifications
      Notification.countDocuments({ recipient: userId, type: 'notification', read: false })
    ]);

    const total = requestsCount + invitationsCount + notificationsCount;

    return res.json({
      requests: requestsCount,
      requestsCount,
      invitations: invitationsCount,
      invitationsCount,
      notifications: notificationsCount,
      notificationsCount,
      total,
      totalUnread: total
    });
  } catch (err) {
    console.error("getUnreadCounts error:", err);
    return res.status(500).json({ error: "Failed to get unread counts." });
  }
};

/**
 * GET /api/inbox
 * Paginated query for specific tab ('requests' | 'invitations' | 'notifications').
 */
export const getInboxItems = async (req, res) => {
  try {
    const userId = req.user._id;
    const { tab = 'requests', page = 1, limit = 20, type = 'received' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    if (tab === 'requests') {
      // Return requests received (as owner) or sent (as requester)
      const filter = type === 'sent' ? { requester: userId } : { owner: userId };

      const [requests, total] = await Promise.all([
        CloneRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('space', 'name description thumbnail visibility')
          .populate('requester', 'username displayName avatarUrl role bio')
          .populate('owner', 'username displayName avatarUrl')
          .lean(),
        CloneRequest.countDocuments(filter)
      ]);

      return res.json({ items: requests, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
    }

    if (tab === 'invitations') {
      const filter = { invitee: userId };
      const [invitations, total] = await Promise.all([
        CollaborationInvite.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('space', 'name description thumbnail tool')
          .populate('inviter', 'username displayName avatarUrl')
          .lean(),
        CollaborationInvite.countDocuments(filter)
      ]);

      return res.json({ items: invitations, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
    }

    // Default: 'notifications' tab
    const filter = { recipient: userId, type: 'notification' };
    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('sender', 'username displayName avatarUrl role')
        .lean(),
      Notification.countDocuments(filter)
    ]);

    return res.json({ items: notifications, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
  } catch (err) {
    console.error("getInboxItems error:", err);
    return res.status(500).json({ error: "Failed to load inbox items." });
  }
};

/**
 * POST /api/inbox/mark-read
 */
export const markTabAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { tab = 'notifications', id } = req.body;

    if (id) {
      await Notification.updateOne({ _id: id, recipient: userId }, { $set: { read: true } });
    } else if (tab === 'notifications') {
      await Notification.updateMany({ recipient: userId, type: 'notification', read: false }, { $set: { read: true } });
    }

    return res.json({ message: "Marked as read." });
  } catch (err) {
    console.error("markTabAsRead error:", err);
    return res.status(500).json({ error: "Failed to mark as read." });
  }
};

/**
 * POST /api/inbox/requests/:id/action
 * Handles Accept, Reject, Reject & Block, Revoke, and Withdraw for Clone Requests.
 */
export const handleCloneRequestAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, permissions = {} } = req.body;
    const userId = req.user._id;

    const request = await CloneRequest.findById(id).populate('space').populate('requester');
    if (!request) {
      return res.status(404).json({ error: "Request not found." });
    }

    // Requester withdrawal
    if (action === 'withdraw') {
      const requesterId = request.requester?._id?.toString() || request.requester?.toString();
      if (requesterId !== userId.toString()) {
        return res.status(403).json({ error: "Unauthorized: only the requester can withdraw this request." });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({ error: `Cannot withdraw request that is already ${request.status}.` });
      }
      request.status = 'withdrawn';
      await request.save();
      return res.json({ message: "Clone request withdrawn.", request });
    }

    // All other actions require space owner
    if (request.owner.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Unauthorized: only the Space owner can take action." });
    }

    if (action === 'revoke') {
      if (request.status !== 'accepted') {
        return res.status(400).json({ error: `Cannot revoke request in '${request.status}' status. Only accepted uncompleted requests can be revoked.` });
      }
      request.status = 'revoked';
      await request.save();

      // Notify requester
      await createInboxNotification({
        recipient: request.requester._id || request.requester,
        sender: userId,
        type: 'notification',
        category: 'request_revoked',
        data: {
          requestId: request._id,
          spaceId: request.space?._id || request.space,
          spaceName: request.space?.name || 'Space',
          text: `revoked the clone approval for "${request.space?.name || 'Space'}"`
        }
      });

      return res.json({ message: "Clone approval revoked.", request });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request has already been ${request.status}.` });
    }

    if (action === 'accept') {
      // 7 days to use the accepted approval (Phase 3.4)
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      request.status = 'accepted';
      request.acceptedAt = new Date();
      request.expiresAt = expiry;
      request.permissions = {
        allowPublishing: Boolean(permissions.allowPublishing),
        allowCollaborators: Boolean(permissions.allowCollaborators),
        allowOthersToClone: Boolean(permissions.allowOthersToClone)
      };
      await request.save();

      // Notify requester
      await createInboxNotification({
        recipient: request.requester._id,
        sender: userId,
        type: 'notification',
        category: 'request_accepted',
        data: {
          requestId: request._id,
          spaceId: request.space._id,
          spaceName: request.space.name,
          text: `accepted your clone request for "${request.space.name}"`
        }
      });

      return res.json({ message: "Clone request approved.", request });
    }

    if (action === 'reject') {
      const nextRejections = (request.rejectedCount || 0) + 1;
      const cooldownDays = nextRejections >= 2 ? 30 : 7;
      const cooldownDate = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000);

      request.status = 'rejected';
      request.rejectedCount = nextRejections;
      request.rejectionCooldownUntil = cooldownDate;
      await request.save();

      // Notify requester
      await createInboxNotification({
        recipient: request.requester._id,
        sender: userId,
        type: 'notification',
        category: 'request_rejected',
        data: {
          requestId: request._id,
          spaceId: request.space._id,
          spaceName: request.space.name,
          text: `declined your clone request for "${request.space.name}"`
        }
      });

      return res.json({ message: "Clone request rejected.", request });
    }

    if (action === 'reject_and_block' || action === 'reject_block') {
      request.status = 'rejected';
      request.isBlocked = true;
      await request.save();

      return res.json({ message: "Requester blocked from this Space.", request });
    }

    return res.status(400).json({ error: "Invalid action. Must be 'accept', 'reject', 'reject_and_block', 'revoke', or 'withdraw'." });
  } catch (err) {
    console.error("handleCloneRequestAction error:", err);
    return res.status(500).json({ error: "Failed to process clone request." });
  }
};

/**
 * POST /api/inbox/invitations/:id/action
 * Handles Accept / Decline for Collaboration Invitations.
 */
export const handleCollaborationInviteAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.user._id;

    const invite = await CollaborationInvite.findById(id).populate('space');
    if (!invite) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    if (invite.invitee.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: `Invitation has already been ${invite.status}.` });
    }

    if (action === 'accept') {
      invite.status = 'accepted';
      await invite.save();

      // Add collaborator to Space if not already present
      const space = await Space.findById(invite.space._id);
      if (space) {
        const alreadyIn = space.collaborators?.some(c => c.user.toString() === userId.toString());
        if (!alreadyIn) {
          space.collaborators.push({
            user: userId,
            role: invite.role || 'viewer',
            addedAt: new Date()
          });
          space.contributorsCount = (space.collaborators.length || 0) + 1;
          await space.save();
        }
      }

      // Notify inviter
      await createInboxNotification({
        recipient: invite.inviter,
        sender: userId,
        type: 'notification',
        category: 'invite_accepted',
        data: {
          spaceId: invite.space._id,
          spaceName: invite.space.name,
          text: `accepted your invitation to collaborate on "${invite.space.name}"`
        }
      });

      return res.json({ message: "Collaboration invitation accepted.", invite });
    }

    if (action === 'decline') {
      invite.status = 'declined';
      await invite.save();

      // Notify inviter
      await createInboxNotification({
        recipient: invite.inviter,
        sender: userId,
        type: 'notification',
        category: 'invite_declined',
        data: {
          spaceId: invite.space._id,
          spaceName: invite.space.name,
          text: `declined your invitation to collaborate on "${invite.space.name}"`
        }
      });

      return res.json({ message: "Collaboration invitation declined.", invite });
    }

    return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'decline'." });
  } catch (err) {
    console.error("handleCollaborationInviteAction error:", err);
    return res.status(500).json({ error: "Failed to process invitation." });
  }
};
