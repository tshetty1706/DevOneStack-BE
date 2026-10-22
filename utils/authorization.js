/**
 * Centralized Server-Side Authorization Engine for DevOneStack
 * can(user, action, space)
 */

export function can(user, action, space) {
  if (!space) return false;

  const userId = user?._id ? user._id.toString() : (user ? user.toString() : null);
  const ownerId = space.owner?._id ? space.owner._id.toString() : space.owner?.toString();
  const isOwner = Boolean(userId && ownerId && userId === ownerId);

  // Find user's collaboration record if logged in
  const userCollab = (userId && Array.isArray(space.collaborators))
    ? space.collaborators.find(c => (c.user?._id || c.user)?.toString() === userId)
    : null;
  const isCollaborator = Boolean(userCollab);
  const isEditor = isCollaborator && userCollab.role === 'editor';
  const isCloned = Boolean(space.clonedFrom);

  switch (action) {
    case 'view':
      // Public spaces are viewable by anyone (including guests/logged-out visitors)
      if (space.visibility === 'public') return true;
      // Private spaces only viewable by owner or accepted collaborators
      return isOwner || isCollaborator;

    case 'edit_items':
      // Owner and accepted editor collaborators can create, edit, move, delete items
      return isOwner || isEditor;

    case 'manage_space':
    case 'delete_space':
      // Only owner can delete space, manage request links, approve clones, manage collaborators
      return isOwner;

    case 'change_visibility':
      return isOwner;

    case 'publish':
      // Owner only, AND if cloned, allowPublishing MUST NOT be false
      if (!isOwner) return false;
      if (isCloned && space.clonePermissions?.allowPublishing === false) {
        return false;
      }
      return true;

    case 'add_collaborator':
      // Owner only, AND if cloned, allowCollaborators MUST NOT be false
      if (!isOwner) return false;
      if (isCloned && space.clonePermissions?.allowCollaborators === false) {
        return false;
      }
      return true;

    case 'enable_request_link':
    case 'approve_clone_request':
      // Owner only, AND if cloned, allowOthersToClone MUST NOT be false
      if (!isOwner) return false;
      if (isCloned && space.clonePermissions?.allowOthersToClone === false) {
        return false;
      }
      return true;

    case 'attach_to_post':
      // Owner only, and Space MUST be public
      return isOwner && space.visibility === 'public';

    case 'star':
      // Only public spaces can be starred by logged in non-owners
      if (space.visibility !== 'public') return false;
      return Boolean(userId && !isOwner);

    case 'clone_direct':
      // Public space direct clone: must be public, cloning enabled, logged in, and non-owner
      if (space.visibility !== 'public') return false;
      if (space.allowCloning === false) return false;
      return Boolean(userId && !isOwner);

    case 'request_clone':
      // Private space clone request: must be private, request link active, logged in, and non-owner
      if (space.visibility !== 'private') return false;
      if (!space.requestLinkEnabled) return false;
      return Boolean(userId && !isOwner);

    default:
      return false;
  }
}

