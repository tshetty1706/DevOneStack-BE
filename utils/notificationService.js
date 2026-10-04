import Notification from "../models/Notification.js";

/**
 * Creates and saves an Inbox notification.
 * @param {object} params
 * @param {string} params.recipient User ObjectId
 * @param {string} [params.sender] User ObjectId
 * @param {string} params.type 'request' | 'invitation' | 'notification'
 * @param {string} params.category Notification category string
 * @param {object} [params.data] Additional metadata payload
 */
export async function createInboxNotification({ recipient, sender = null, type, category, data = {} }) {
  if (!recipient || !type || !category) return null;

  try {
    // Avoid duplicate notifications (e.g. liking multiple times)
    if (category === 'post_like' && sender && data.postId) {
      const existing = await Notification.findOne({
        recipient,
        sender,
        category: 'post_like',
        'data.postId': data.postId
      });
      if (existing) return existing;
    }

    if (category === 'space_starred' && sender && data.spaceId) {
      const existing = await Notification.findOne({
        recipient,
        sender,
        category: 'space_starred',
        'data.spaceId': data.spaceId
      });
      if (existing) return existing;
    }

    const notification = await Notification.create({
      recipient,
      sender,
      type,
      category,
      data,
      read: false
    });

    return notification;
  } catch (err) {
    console.error("createInboxNotification error:", err);
    return null;
  }
}
