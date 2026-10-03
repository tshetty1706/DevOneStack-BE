import Space from "../models/Space.js";
import CollaborationInvite from "../models/CollaborationInvite.js";
import User from "../models/User.js";
import { createInboxNotification } from "../utils/notificationService.js";
import { can } from "../utils/authorization.js";

/**
 * POST /api/collaborators/invite
 * Owner invites a user by EXACT username only (max 5 collaborators per space).
 */
export const inviteCollaborator = async (req, res) => {
  try {
    const { spaceId, username, role = 'viewer' } = req.body;
    const userId = req.user._id;

    if (!spaceId || !username) {
      return res.status(400).json({ error: "Space ID and exact username are required." });
    }

    const space = await Space.findById(spaceId);
    if (!space) {
      return res.status(404).json({ error: "Space not found." });
    }

    if (!can(req.user, 'manage_space', space)) {
      return res.status(403).json({ error: "Only the Space owner can invite collaborators." });
    }

    // Check clone permissions if cloned from private space
    if (space.clonedFromPrivate && space.clonePermissions?.allowCollaborators === false) {
      return res.status(403).json({ error: "Collaboration is disabled for this cloned Space by the original owner." });
    }

    // Limit: Max 5 collaborators
    if ((space.collaborators?.length || 0) >= 5) {
      return res.status(400).json({ error: "Maximum limit of 5 collaborators reached for this Space." });
    }

    // Lookup user by EXACT username (no fuzzy match)
    const invitee = await User.findOne({ username: String(username).trim() }).select('_id username displayName');
    if (!invitee) {
      return res.status(404).json({ error: "User with this exact username was not found." });
    }

    if (invitee._id.toString() === userId.toString()) {
      return res.status(400).json({ error: "You are the owner of this Space." });
    }

    const alreadyCollaborator = space.collaborators?.some(c => c.user.toString() === invitee._id.toString());
    if (alreadyCollaborator) {
      return res.status(400).json({ error: "User is already a collaborator on this Space." });
    }

    const existingPending = await CollaborationInvite.findOne({
      space: space._id,
      invitee: invitee._id,
      status: 'pending'
    });
    if (existingPending) {
      return res.status(400).json({ error: "An active invitation has already been sent to this user." });
    }

    const invite = await CollaborationInvite.create({
      space: space._id,
      inviter: userId,
      invitee: invitee._id,
      role: ['viewer', 'editor'].includes(role) ? role : 'viewer',
      status: 'pending'
    });

    // Send notification to invitee Inbox
    await createInboxNotification({
      recipient: invitee._id,
      sender: userId,
      type: 'invitation',
      category: 'collab_invite',
      data: {
        inviteId: invite._id,
        spaceId: space._id,
        spaceName: space.name,
        role: invite.role,
        text: `invited you to collaborate as an ${invite.role.toUpperCase()} on "${space.name}"`
      }
    });

    return res.status(201).json({
      message: `Invitation sent to @${invitee.username}. They will receive it in their Inbox.`,
      invite
    });
  } catch (err) {
    console.error("inviteCollaborator error:", err);
    return res.status(500).json({ error: "Failed to invite collaborator." });
  }
};

/**
 * DELETE /api/collaborators/:spaceId/:collaboratorUserId
 * Remove collaborator (or collaborator leaves).
 */
export const removeCollaborator = async (req, res) => {
  try {
    const { spaceId, collaboratorUserId } = req.params;
    const userId = req.user._id;

    const space = await Space.findById(spaceId);
    if (!space) {
      return res.status(404).json({ error: "Space not found." });
    }

    const isOwner = space.owner.toString() === userId.toString();
    const isSelfLeaving = collaboratorUserId === userId.toString();

    if (!isOwner && !isSelfLeaving) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    space.collaborators = space.collaborators.filter(c => c.user.toString() !== collaboratorUserId);
    space.contributorsCount = Math.max(1, (space.collaborators.length || 0) + 1);
    await space.save();

    // Revoke any pending invites
    await CollaborationInvite.updateMany(
      { space: spaceId, invitee: collaboratorUserId, status: 'pending' },
      { $set: { status: 'revoked' } }
    );

    return res.json({ message: "Collaborator removed successfully.", collaborators: space.collaborators });
  } catch (err) {
    console.error("removeCollaborator error:", err);
    return res.status(500).json({ error: "Failed to remove collaborator." });
  }
};

/**
 * PATCH /api/collaborators/:spaceId/:collaboratorUserId
 * Change collaborator role (viewer <-> editor).
 */
export const updateCollaboratorRole = async (req, res) => {
  try {
    const { spaceId, collaboratorUserId } = req.params;
    const { role } = req.body;
    const userId = req.user._id;

    if (!['viewer', 'editor'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'viewer' or 'editor'." });
    }

    const space = await Space.findById(spaceId);
    if (!space) {
      return res.status(404).json({ error: "Space not found." });
    }

    if (!can(req.user, 'manage_space', space)) {
      return res.status(403).json({ error: "Only the Space owner can update collaborator roles." });
    }

    const collab = space.collaborators?.find(c => c.user.toString() === collaboratorUserId);
    if (!collab) {
      return res.status(404).json({ error: "Collaborator not found on this Space." });
    }

    collab.role = role;
    await space.save();

    return res.json({ message: "Collaborator role updated.", collaborators: space.collaborators });
  } catch (err) {
    console.error("updateCollaboratorRole error:", err);
    return res.status(500).json({ error: "Failed to update collaborator role." });
  }
};
