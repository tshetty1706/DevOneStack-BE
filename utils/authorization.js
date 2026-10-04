/**
 * Centralized Server-Side Authorization Engine for DevOneStack
 * can(user, action, space)
 */

export function can(user, action, space) {
  if (!space) return false;

  const userId = user?._id ? user._id.toString() : null;
  const ownerId = space.owner?._id ? space.owner._id.toString() : space.owner?.toString();
  const isOwner = Boolean(userId && ownerId && userId === ownerId);

  // Find user's collaboration record if logged in
  const userCollab = (userId && Array.isArray(space.collaborators))
    ? space.collaborators.find(c => (c.user?._id || c.user)?.toString() === userId)
    : null;
  const isCollaborator = Boolean(userCollab);
  const isEditor = isCollaborator && userCollab.role === 'editor';

  switch (action) {
    case 'view':
      // Public spaces are viewable by anyone (including guests)
      if (space.visibility === 'public') return true;
      // Private spaces only viewable by owner or accepted collaborators
      return isOwner || isCollaborator;

    case 'edit_items':
      // Owner and accepted editor collaborators can create, edit, move, delete items
      return isOwner || isEditor;

    case 'manage_space':
      // Only owner can delete space, change visibility, manage request links, approve clones, manage collaborators
      return isOwner;

    case 'star':
      // Only public spaces can be starred by logged in non-owners
      if (space.visibility !== 'public') return false;
      return Boolean(userId && !isOwner);

    case 'clone_direct':
      // Public space direct clone
      if (space.visibility !== 'public') return false;
      return space.allowCloning !== false;

    case 'request_clone':
      // Private space clone request
      if (space.visibility === 'private') {
        return Boolean(userId && !isOwner);
      }
      return false;

    default:
      return false;
  }
}
