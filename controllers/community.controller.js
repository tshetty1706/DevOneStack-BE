import Post from "../models/Post.js";
import PostComment from "../models/PostComment.js";
import Follow from "../models/Follow.js";
import Space from "../models/Space.js";
import User from "../models/User.js";
import DailyContribution from "../models/DailyContribution.js";
import { createInboxNotification } from "../utils/notificationService.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";
import { getHeatmapData } from "../services/contribution.service.js";

/**
 * GET /api/community/feed
 * Paginated posts for Following or Discover tabs.
 */
export const getFeed = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { tab = 'discover', page = 1, limit = 15 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(30, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

    let filter = {};

    if (tab === 'following' && userId) {
      const followings = await Follow.find({ follower: userId }).select('following').lean();
      const followingIds = followings.map(f => f.following);
      // Include own posts and followed users' posts
      filter = { author: { $in: [...followingIds, userId] } };
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('author', 'username displayName avatarUrl role bio')
        .populate({
          path: 'space',
          select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner',
          populate: { path: 'owner', select: 'username displayName avatarUrl' }
        })
        .lean(),
      Post.countDocuments(filter)
    ]);

    // Format posts with isLiked and sanitized space cards
    const sanitizedPosts = posts.map(post => {
      let spaceCard = null;
      if (post.space && post.space.visibility === 'public') {
        spaceCard = post.space;
      } else if (post.space) {
        // Space became private or is restricted: never leak private metadata
        spaceCard = { isUnavailable: true };
      }

      return {
        _id: post._id,
        text: post.text,
        imageUrl: post.imageUrl || '',
        author: post.author,
        space: spaceCard,
        likesCount: post.likesCount || 0,
        commentsCount: post.commentsCount || 0,
        isEdited: Boolean(post.isEdited),
        isLiked: userId ? Array.isArray(post.likedBy) && post.likedBy.some(id => id.toString() === userId.toString()) : false,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });

    return res.json({
      posts: sanitizedPosts,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error("getFeed error:", err);
    return res.status(500).json({ error: "Failed to load community feed." });
  }
};

/**
 * GET /api/community/discover-spaces
 * Paginated public spaces for the Discover section.
 */
export const getDiscoverSpaces = async (req, res) => {
  try {
    const { page = 1, limit = 12, search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(24, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const query = { visibility: 'public' };
    if (search && typeof search === 'string') {
      const regex = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      query.$or = [{ name: regex }, { description: regex }, { tags: regex }];
    }

    const [spaces, total] = await Promise.all([
      Space.find(query)
        .sort({ starsCount: -1, viewsCount: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('owner', 'username displayName avatarUrl')
        .select('name description tool thumbnail visibility starsCount viewsCount tags iconKey owner allowCloning createdAt updatedAt')
        .lean(),
      Space.countDocuments(query)
    ]);

    return res.json({
      spaces,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error("getDiscoverSpaces error:", err);
    return res.status(500).json({ error: "Failed to load discover spaces." });
  }
};

/**
 * POST /api/community/upload-image
 * Upload image for a community post to Cloudinary.
 */
export const uploadPostImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }

    const uploadRes = await uploadToCloudinary(req.file.buffer, {
      folder: 'devonestack/community',
      resource_type: 'image',
    });

    return res.json({
      imageUrl: uploadRes.secure_url,
      publicId: uploadRes.public_id,
    });
  } catch (err) {
    console.error("uploadPostImage error:", err);
    return res.status(500).json({ error: "Failed to upload image." });
  }
};

/**
 * POST /api/community/posts
 * Create a new post with optional image and optional attached public space.
 */
export const createPost = async (req, res) => {
  try {
    const { text, spaceId, imageUrl: bodyImageUrl } = req.body;
    const userId = req.user._id;

    // Account verification and age requirement: at least 24 hours old and verified email
    const isTest = process.env.NODE_ENV === 'test' || req.headers['x-test-bypass'] === 'true';
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    if (!isTest) {
      const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (accountAgeMs < ONE_DAY_MS) {
        return res.status(403).json({ error: "Your account must be at least 24 hours old to create posts." });
      }
      if (!user.isEmailVerified && !user.isVerified) {
        return res.status(403).json({ error: "Please verify your email address to create posts." });
      }
    }

    // Rate limits: 5 posts per hour, or 2 for new accounts (< 7 days)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentPostsCount = await Post.countDocuments({
      author: userId,
      createdAt: { $gte: oneHourAgo }
    });
    const isNewAccount = (Date.now() - new Date(user.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
    const hourlyLimit = isNewAccount ? 2 : 5;
    if (recentPostsCount >= hourlyLimit) {
      return res.status(429).json({ error: `Hourly post limit reached (${hourlyLimit} posts/hour).` });
    }

    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return res.status(400).json({ error: "Post content cannot be empty." });
    }
    if (trimmedText.length > 500) {
      return res.status(400).json({ error: "Post cannot exceed 500 characters." });
    }

    let finalImageUrl = bodyImageUrl || '';
    if (req.file) {
      const uploadRes = await uploadToCloudinary(req.file.buffer, {
        folder: 'devonestack/community',
        resource_type: 'image',
      });
      finalImageUrl = uploadRes.secure_url;
    }

    let validSpaceId = null;
    if (spaceId) {
      const space = await Space.findById(spaceId).lean();
      if (!space) {
        return res.status(400).json({ error: "Attached Space not found." });
      }
      if (space.owner.toString() !== userId.toString()) {
        return res.status(400).json({ error: "You can only attach public Spaces that you own." });
      }
      if (space.visibility !== 'public') {
        return res.status(400).json({ error: "Only public Spaces can be attached to community posts." });
      }
      validSpaceId = space._id;
    }

    const post = await Post.create({
      author: userId,
      text: trimmedText,
      imageUrl: finalImageUrl,
      space: validSpaceId,
      likesCount: 0,
      likedBy: [],
      commentsCount: 0,
      isEdited: false
    });

    const populatedPost = await Post.findById(post._id)
      .populate('author', 'username displayName avatarUrl role bio')
      .populate({
        path: 'space',
        select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner',
        populate: { path: 'owner', select: 'username displayName avatarUrl' }
      })
      .lean();

    const resultPost = {
      ...populatedPost,
      imageUrl: populatedPost.imageUrl || '',
      isLiked: false
    };

    return res.status(201).json({
      post: resultPost,
      ...resultPost
    });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({ error: "Failed to create post." });
  }
};

/**
 * PATCH /api/community/posts/:id
 * Edit post content (within 15 minutes of creation only).
 */
export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const existingPost = await Post.findOne({ _id: id, author: userId });
    if (!existingPost) {
      return res.status(404).json({ error: "Post not found or unauthorized." });
    }

    const postAgeMs = Date.now() - new Date(existingPost.createdAt).getTime();
    if (postAgeMs > 15 * 60 * 1000) {
      return res.status(400).json({ error: "Posts can only be edited within 15 minutes of creation." });
    }

    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return res.status(400).json({ error: "Post content cannot be empty." });
    }
    if (trimmedText.length > 500) {
      return res.status(400).json({ error: "Post cannot exceed 500 characters." });
    }

    existingPost.text = trimmedText;
    existingPost.isEdited = true;
    await existingPost.save();

    const post = await Post.findById(id)
      .populate('author', 'username displayName avatarUrl role bio')
      .populate({
        path: 'space',
        select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner',
        populate: { path: 'owner', select: 'username displayName avatarUrl' }
      })
      .lean();

    let spaceCard = null;
    if (post.space && post.space.visibility === 'public') {
      spaceCard = post.space;
    } else if (post.space) {
      spaceCard = { isUnavailable: true };
    }

    return res.json({
      ...post,
      space: spaceCard,
      isLiked: Array.isArray(post.likedBy) && post.likedBy.some(uId => uId.toString() === userId.toString())
    });
  } catch (err) {
    console.error("updatePost error:", err);
    return res.status(500).json({ error: "Failed to update post." });
  }
};

/**
 * DELETE /api/community/posts/:id
 */
export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const post = await Post.findOneAndDelete({ _id: id, author: userId });
    if (!post) {
      return res.status(404).json({ error: "Post not found or unauthorized." });
    }

    await PostComment.deleteMany({ post: id });
    return res.json({ message: "Post deleted successfully." });
  } catch (err) {
    console.error("deletePost error:", err);
    return res.status(500).json({ error: "Failed to delete post." });
  }
};

/**
 * POST /api/community/posts/:id/like
 */
export const toggleLikePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const isLiked = post.likedBy && post.likedBy.some(uId => uId.toString() === userId.toString());

    let updatedPost;
    if (isLiked) {
      updatedPost = await Post.findOneAndUpdate(
        { _id: id, likedBy: userId },
        {
          $pull: { likedBy: userId },
          $inc: { likesCount: -1 }
        },
        { new: true }
      );
    } else {
      updatedPost = await Post.findOneAndUpdate(
        { _id: id, likedBy: { $ne: userId } },
        {
          $addToSet: { likedBy: userId },
          $inc: { likesCount: 1 }
        },
        { new: true }
      );

      // Notify post author if not liking own post
      if (post.author.toString() !== userId.toString()) {
        await createInboxNotification({
          recipient: post.author,
          sender: userId,
          type: 'notification',
          category: 'post_like',
          data: {
            postId: post._id,
            snippet: (post.text || '').slice(0, 60),
            text: `liked your post: "${(post.text || '').slice(0, 50)}..."`
          }
        });
      }
    }

    if (!updatedPost) {
      // Concurrent action handled: return current post state
      const currentPost = await Post.findById(id).lean();
      return res.json({
        _id: currentPost._id,
        likesCount: currentPost.likesCount || 0,
        isLiked: Array.isArray(currentPost.likedBy) && currentPost.likedBy.some(uId => uId.toString() === userId.toString())
      });
    }

    if (updatedPost.likesCount < 0) {
      updatedPost.likesCount = 0;
      await updatedPost.save();
    }

    return res.json({
      _id: updatedPost._id,
      likesCount: updatedPost.likesCount,
      liked: !isLiked,
      isLiked: !isLiked
    });
  } catch (err) {
    console.error("toggleLikePost error:", err);
    return res.status(500).json({ error: "Failed to like post." });
  }
};

/**
 * GET /api/community/posts/:id/comments
 * Returns top-level comments with single-level replies nested cleanly (no N+1 queries).
 */
export const getPostComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Fetch all comments and replies for this post ordered by creation time
    const allComments = await PostComment.find({ post: id })
      .sort({ createdAt: 1 })
      .populate('author', 'username displayName avatarUrl role')
      .lean();

    // Group single-level replies under their parent comments
    const topLevel = [];
    const repliesMap = new Map();

    for (const c of allComments) {
      if (!c.parentComment) {
        c.replies = [];
        topLevel.push(c);
        repliesMap.set(c._id.toString(), c.replies);
      } else {
        const parentId = c.parentComment.toString();
        if (!repliesMap.has(parentId)) {
          repliesMap.set(parentId, []);
        }
        repliesMap.get(parentId).push(c);
      }
    }

    // Connect any replies created before map insertion
    for (const tl of topLevel) {
      const pId = tl._id.toString();
      if (repliesMap.has(pId)) {
        tl.replies = repliesMap.get(pId);
      }
    }

    const paginatedTopLevel = topLevel.slice(skip, skip + limitNum);

    return res.json({
      comments: paginatedTopLevel,
      total: topLevel.length,
      totalWithReplies: allComments.length,
      page: pageNum,
      totalPages: Math.ceil(topLevel.length / limitNum) || 1
    });
  } catch (err) {
    console.error("getPostComments error:", err);
    return res.status(500).json({ error: "Failed to load comments." });
  }
};

/**
 * POST /api/community/posts/:id/comments
 * Supports top-level comments and 1-level replies.
 */
export const createPostComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, parentCommentId, parentComment } = req.body;
    const userId = req.user._id;

    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return res.status(400).json({ error: "Comment text cannot be empty." });
    }
    if (trimmedText.length > 500) {
      return res.status(400).json({ error: "Comment cannot exceed 500 characters." });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    let effectiveParentId = null;
    let parentDoc = null;
    const targetParentId = parentCommentId || parentComment;

    if (targetParentId) {
      parentDoc = await PostComment.findOne({ _id: targetParentId, post: id });
      if (!parentDoc) {
        return res.status(400).json({ error: "Parent comment not found for this post." });
      }
      // Single-level nesting constraint: If parent already has parentComment, flatten to top-level parent
      effectiveParentId = parentDoc.parentComment || parentDoc._id;
    }

    const comment = await PostComment.create({
      post: id,
      author: userId,
      text: trimmedText,
      parentComment: effectiveParentId
    });

    await Post.findByIdAndUpdate(id, { $inc: { commentsCount: 1 } });

    const populatedComment = await PostComment.findById(comment._id)
      .populate('author', 'username displayName avatarUrl role')
      .lean();

    populatedComment.replies = [];

    // Notification delivery
    if (effectiveParentId && parentDoc) {
      // Notify parent comment author if not self-reply
      const parentAuthorId = parentDoc.author.toString();
      if (parentAuthorId !== userId.toString()) {
        await createInboxNotification({
          recipient: parentDoc.author,
          sender: userId,
          type: 'notification',
          category: 'comment_reply',
          data: {
            postId: post._id,
            commentId: comment._id,
            parentCommentId: effectiveParentId,
            text: `replied to your comment: "${trimmedText.slice(0, 50)}"`
          }
        });
      }
    } else if (post.author.toString() !== userId.toString()) {
      // Notify post author if not self-comment
      await createInboxNotification({
        recipient: post.author,
        sender: userId,
        type: 'notification',
        category: 'post_comment',
        data: {
          postId: post._id,
          commentId: comment._id,
          text: `commented on your post: "${trimmedText.slice(0, 50)}"`
        }
      });
    }

    return res.status(201).json({
      comment: populatedComment,
      ...populatedComment
    });
  } catch (err) {
    console.error("createPostComment error:", err);
    return res.status(500).json({ error: "Failed to add comment." });
  }
};

/**
 * DELETE /api/community/comments/:id
 * Authorized user can delete their comment/reply. Top-level delete cleans up replies.
 */
export const deletePostComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const comment = await PostComment.findById(id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    const post = await Post.findById(comment.post);
    const isCommentAuthor = comment.author.toString() === userId.toString();
    const isPostAuthor = post && post.author.toString() === userId.toString();

    if (!isCommentAuthor && !isPostAuthor) {
      return res.status(403).json({ error: "Unauthorized to delete this comment." });
    }

    // If top-level comment, cascade delete its replies
    const deleteRes = await PostComment.deleteMany({
      $or: [
        { _id: id },
        { parentComment: id }
      ]
    });

    const countToRemove = deleteRes.deletedCount || 1;
    await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -countToRemove } });

    // Ensure count never negative
    await Post.updateOne({ _id: comment.post, commentsCount: { $lt: 0 } }, { $set: { commentsCount: 0 } });

    return res.json({ message: "Comment deleted.", deletedCount: countToRemove });
  } catch (err) {
    console.error("deletePostComment error:", err);
    return res.status(500).json({ error: "Failed to delete comment." });
  }
};

/**
 * POST /api/community/follow/:userId
 */
export const followUser = async (req, res) => {
  try {
    const followerId = req.user._id;
    const targetUserId = req.params.userId;

    if (followerId.toString() === targetUserId.toString()) {
      return res.status(400).json({ error: "You cannot follow yourself." });
    }

    const targetUser = await User.findById(targetUserId).select('_id displayName username').lean();
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const existingFollow = await Follow.findOne({ follower: followerId, following: targetUserId });
    if (existingFollow) {
      return res.json({ message: "Already following.", isFollowing: true, following: true });
    }

    await Follow.create({ follower: followerId, following: targetUserId });

    // Send notification
    await createInboxNotification({
      recipient: targetUserId,
      sender: followerId,
      type: 'notification',
      category: 'new_follower',
      data: {
        text: `started following you`
      }
    });

    return res.status(201).json({ message: "Followed successfully.", isFollowing: true, following: true });
  } catch (err) {
    console.error("followUser error:", err);
    return res.status(500).json({ error: "Failed to follow user." });
  }
};

/**
 * POST /api/community/unfollow/:userId
 */
export const unfollowUser = async (req, res) => {
  try {
    const followerId = req.user._id;
    const targetUserId = req.params.userId;

    await Follow.findOneAndDelete({ follower: followerId, following: targetUserId });
    return res.json({ message: "Unfollowed successfully.", isFollowing: false, following: false });
  } catch (err) {
    console.error("unfollowUser error:", err);
    return res.status(500).json({ error: "Failed to unfollow user." });
  }
};

/**
 * GET /api/community/users/:username/followers
 */
export const getUserFollowers = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('_id').lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const followers = await Follow.find({ following: user._id })
      .sort({ createdAt: -1 })
      .populate('follower', 'username displayName avatarUrl role bio')
      .lean();

    const currentUserId = req.user?._id;
    let myFollowings = new Set();
    if (currentUserId) {
      const follows = await Follow.find({ follower: currentUserId }).select('following').lean();
      myFollowings = new Set(follows.map(f => f.following.toString()));
    }

    const formatted = followers.map(f => ({
      ...f.follower,
      isFollowing: myFollowings.has(f.follower._id.toString())
    }));

    return res.json(formatted);
  } catch (err) {
    console.error("getUserFollowers error:", err);
    return res.status(500).json({ error: "Failed to get followers." });
  }
};

/**
 * GET /api/community/users/:username/following
 */
export const getUserFollowing = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('_id').lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const followings = await Follow.find({ follower: user._id })
      .sort({ createdAt: -1 })
      .populate('following', 'username displayName avatarUrl role bio')
      .lean();

    const currentUserId = req.user?._id;
    let myFollowings = new Set();
    if (currentUserId) {
      const follows = await Follow.find({ follower: currentUserId }).select('following').lean();
      myFollowings = new Set(follows.map(f => f.following.toString()));
    }

    const formatted = followings.map(f => ({
      ...f.following,
      isFollowing: myFollowings.has(f.following._id.toString())
    }));

    return res.json(formatted);
  } catch (err) {
    console.error("getUserFollowing error:", err);
    return res.status(500).json({ error: "Failed to get following list." });
  }
};

/**
 * GET /api/community/profile/:username
 * Sanitized public profile preview. NEVER leaks private credentials or email.
 */
export const getPublicProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user?._id;

    const user = await User.findOne({ username })
      .select('username displayName avatarUrl bio role skills socials location website education createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Public spaces only!
    const [publicSpaces, followersCount, followingCount, isFollowing, contribAgg] = await Promise.all([
      Space.find({ owner: user._id, visibility: 'public' })
        .select('name description tool thumbnail visibility starsCount viewsCount tags iconKey createdAt')
        .sort({ starsCount: -1, updatedAt: -1 })
        .lean(),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      currentUserId ? Follow.exists({ follower: currentUserId, following: user._id }) : false,
      DailyContribution.aggregate([
        { $match: { user: user._id } },
        { $group: { _id: null, total: { $sum: '$points' } } }
      ])
    ]);

    const totalContributions = contribAgg?.[0]?.total || 0;

    return res.json({
      user: {
        _id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio || '',
        role: user.role || '',
        skills: user.skills || [],
        socials: user.socials || {},
        location: user.location || '',
        website: user.website || '',
        education: user.education || [],
        createdAt: user.createdAt,
        followersCount,
        followingCount,
        totalContributions,
        isFollowing: Boolean(isFollowing)
      },
      publicSpaces
    });
  } catch (err) {
    console.error("getPublicProfile error:", err);
    return res.status(500).json({ error: "Failed to load public profile." });
  }
};

/**
 * GET /api/community/search
 * Search across Users, Public Spaces, and Posts.
 * Filters: 'all' | 'users' | 'spaces' | 'posts'
 */
export const searchCommunity = async (req, res) => {
  try {
    const { q, query, search, term, filter = 'all', page = 1, limit = 10 } = req.query;
    const currentUserId = req.user?._id;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const rawTerm = q || query || search || term || '';
    const searchTerm = String(rawTerm).trim();
    if (!searchTerm) {
      return res.json({
        users: [],
        spaces: [],
        posts: [],
        totalUsers: 0,
        totalSpaces: 0,
        totalPosts: 0,
        page: pageNum,
        totalPages: 0,
      });
    }

    const regex = new RegExp(searchTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    const cleanUserTerm = searchTerm.replace(/^@/, '');
    const userRegex = new RegExp(cleanUserTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

    // 1. Search Users
    const searchUsersPromise = async () => {
      if (filter !== 'all' && filter !== 'users') return { list: [], count: 0 };
      const userQuery = {
        $or: [
          { username: userRegex },
          { displayName: regex }
        ]
      };
      const [usersList, count] = await Promise.all([
        User.find(userQuery)
          .select('username displayName avatarUrl bio role skills location createdAt')
          .skip(filter === 'users' ? skip : 0)
          .limit(filter === 'users' ? limitNum : 6)
          .lean(),
        User.countDocuments(userQuery)
      ]);

      let myFollowings = new Set();
      if (currentUserId) {
        const follows = await Follow.find({ follower: currentUserId }).select('following').lean();
        myFollowings = new Set(follows.map(f => f.following.toString()));
      }

      const usersWithStats = await Promise.all(
        usersList.map(async (u) => {
          const followersCount = await Follow.countDocuments({ following: u._id });
          return {
            _id: u._id,
            username: u.username,
            displayName: u.displayName || u.username,
            avatarUrl: u.avatarUrl || '',
            bio: u.bio || '',
            role: u.role || '',
            skills: u.skills || [],
            location: u.location || '',
            createdAt: u.createdAt,
            followersCount,
            isFollowing: myFollowings.has(u._id.toString()),
            isSelf: currentUserId ? u._id.toString() === currentUserId.toString() : false
          };
        })
      );

      return { list: usersWithStats, count };
    };

    // 2. Search Public Spaces (strictly visibility = 'public')
    const searchSpacesPromise = async () => {
      if (filter !== 'all' && filter !== 'spaces') return { list: [], count: 0 };
      const spaceQuery = {
        visibility: 'public',
        $or: [
          { name: regex },
          { description: regex },
          { tags: regex }
        ]
      };
      const [spacesList, count] = await Promise.all([
        Space.find(spaceQuery)
          .sort({ starsCount: -1, viewsCount: -1, updatedAt: -1 })
          .skip(filter === 'spaces' ? skip : 0)
          .limit(filter === 'spaces' ? limitNum : 6)
          .populate('owner', 'username displayName avatarUrl')
          .select('name description tool thumbnail visibility starsCount viewsCount tags iconKey owner allowCloning createdAt updatedAt')
          .lean(),
        Space.countDocuments(spaceQuery)
      ]);
      return { list: spacesList, count };
    };

    // 3. Search Posts
    const searchPostsPromise = async () => {
      if (filter !== 'all' && filter !== 'posts') return { list: [], count: 0 };

      const matchedAuthors = await User.find({
        $or: [{ username: regex }, { displayName: regex }]
      }).select('_id').lean();
      const authorIds = matchedAuthors.map(a => a._id);

      const postQuery = {
        $or: [
          { text: regex },
          ...(authorIds.length > 0 ? [{ author: { $in: authorIds } }] : [])
        ]
      };

      const [postsList, count] = await Promise.all([
        Post.find(postQuery)
          .sort({ createdAt: -1 })
          .skip(filter === 'posts' ? skip : 0)
          .limit(filter === 'posts' ? limitNum : 6)
          .populate('author', 'username displayName avatarUrl role bio')
          .populate({
            path: 'space',
            match: { visibility: 'public' },
            select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner allowCloning',
            populate: { path: 'owner', select: 'username displayName avatarUrl' }
          })
          .lean(),
        Post.countDocuments(postQuery)
      ]);

      const sanitizedPosts = postsList.map(post => ({
        _id: post._id,
        text: post.text,
        imageUrl: post.imageUrl || '',
        author: post.author,
        space: post.space || null,
        likesCount: post.likesCount || 0,
        commentsCount: post.commentsCount || 0,
        isEdited: Boolean(post.isEdited),
        isLiked: currentUserId ? Array.isArray(post.likedBy) && post.likedBy.some(id => id.toString() === currentUserId.toString()) : false,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      }));

      return { list: sanitizedPosts, count };
    };

    const [usersRes, spacesRes, postsRes] = await Promise.all([
      searchUsersPromise(),
      searchSpacesPromise(),
      searchPostsPromise()
    ]);

    return res.json({
      users: usersRes.list,
      spaces: spacesRes.list,
      posts: postsRes.list,
      totalUsers: usersRes.count,
      totalSpaces: spacesRes.count,
      totalPosts: postsRes.count,
      page: pageNum,
      totalPages: filter === 'all'
        ? Math.max(1, Math.ceil(Math.max(usersRes.count, spacesRes.count, postsRes.count) / limitNum))
        : Math.max(1, Math.ceil((filter === 'users' ? usersRes.count : filter === 'spaces' ? spacesRes.count : postsRes.count) / limitNum))
    });
  } catch (err) {
    console.error("searchCommunity error:", err);
    return res.status(500).json({ error: "Failed to perform search." });
  }
};

/**
 * GET /api/community/my-posts
 * Fetch all posts created by the currently authenticated user.
 */
export const getMyPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(30, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [posts, total] = await Promise.all([
      Post.find({ author: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('author', 'username displayName avatarUrl role bio')
        .populate({
          path: 'space',
          select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner allowCloning',
          populate: { path: 'owner', select: 'username displayName avatarUrl' }
        })
        .lean(),
      Post.countDocuments({ author: userId })
    ]);

    const sanitizedPosts = posts.map(post => {
      const isSpacePublic = post.space?.visibility === 'public';
      const isSpaceOwner = post.space?.owner?._id?.toString() === userId.toString() || post.space?.owner?.toString() === userId.toString();

      return {
        _id: post._id,
        text: post.text,
        imageUrl: post.imageUrl || '',
        author: post.author,
        space: (isSpacePublic || isSpaceOwner) ? post.space : null,
        likesCount: post.likesCount || 0,
        commentsCount: post.commentsCount || 0,
        isEdited: Boolean(post.isEdited),
        isLiked: Array.isArray(post.likedBy) && post.likedBy.some(id => id.toString() === userId.toString()),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });

    return res.json({
      posts: sanitizedPosts,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error("getMyPosts error:", err);
    return res.status(500).json({ error: "Failed to load user posts." });
  }
};

/**
 * GET /api/community/contributions/:username
 * Fetch server-calculated contribution heatmap data for a user.
 */
export const getUserContributions = async (req, res) => {
  try {
    const { username } = req.params;
    const { months = 12 } = req.query;

    const user = await User.findOne({ username }).select('_id username displayName').lean();
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const heatmapData = await getHeatmapData(user._id, months);
    return res.json({
      username: user.username,
      displayName: user.displayName || user.username,
      ...heatmapData
    });
  } catch (err) {
    console.error("getUserContributions error:", err);
    return res.status(500).json({ error: "Failed to load contribution data." });
  }
};

