import Space from '../models/Space.js';
import History from '../models/History.js';
import { can } from './authorization.js';

/**
 * Verifies that a Space exists and that the user is authorized to perform the action.
 * Defaults to 'edit_items' which allows space owner and editor collaborators.
 * @param {string} spaceId
 * @param {string|object} userId
 * @param {string} [requiredAction='edit_items']
 * @returns {Promise<Space|null>}
 */
export async function verifySpaceOwnership(spaceId, userId, requiredAction = 'edit_items') {
  if (!spaceId || !userId) return null;
  const space = await Space.findById(spaceId);
  if (!space) return null;

  if (!can(userId, requiredAction, space)) {
    return null;
  }
  return space;
}

/**
 * Verifies that a Space exists and that the user is authorized to view it.
 * @param {string} spaceId
 * @param {string|object} userId
 * @returns {Promise<Space|null>}
 */
export async function verifySpaceViewAccess(spaceId, userId) {
  if (!spaceId) return null;
  const space = await Space.findById(spaceId);
  if (!space) return null;

  if (!can(userId, 'view', space)) {
    return null;
  }
  return space;
}

/**
 * Atomically updates a space's counter field by a delta (+1 or -1).
 * @param {string} spaceId
 * @param {string} countField
 * @param {number} delta
 */
export async function updateSpaceResourceCount(spaceId, countField, delta = 1) {
  if (!spaceId || !countField) return null;
  return Space.findByIdAndUpdate(
    spaceId,
    { $inc: { [countField]: delta } },
    { new: true }
  );
}

/**
 * Creates an activity history record for a user action.
 * @param {string} userId
 * @param {string} action
 * @param {string} label
 * @param {object} meta
 */
export async function logUserHistory(userId, action, label, meta = {}) {
  try {
    return await History.create({
      owner: userId,
      action,
      label,
      meta,
    });
  } catch (err) {
    console.error('Failed to log history:', err.message);
    return null;
  }
}

/**
 * Normalizes an array or comma-separated string of tags to trimmed lowercase strings.
 * @param {string[]|string} tags
 * @returns {string[]}
 */
export function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
      .filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

/**
 * Standardized error response handler.
 * @param {object} res Express response
 * @param {Error|string} err
 * @param {string} defaultMsg
 * @param {number} status
 */
export function sendError(res, err, defaultMsg = 'Internal Server Error', status = 500) {
  const errorMsg = typeof err === 'string' ? err : err?.message || defaultMsg;
  return res.status(status).json({ error: errorMsg });
}
