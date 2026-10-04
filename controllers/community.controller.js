import Post from "../models/Post.js";
import PostComment from "../models/PostComment.js";
import Follow from "../models/Follow.js";
import Space from "../models/Space.js";
import User from "../models/User.js";
import { createInboxNotification } from "../utils/notificationService.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";

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
          match: { visibility: 'public' },
          select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner',
          populate: { path: 'owner', select: 'username displayName avatarUrl' }
        })
        .lean(),
      Post.countDocuments(filter)
    ]);

    // Format posts with isLiked and sanitized space cards
    const sanitizedPosts = posts.map(post => ({
      _id: post._id,
      text: post.text,
      imageUrl: post.imageUrl || '',
      author: post.author,
      space: post.space || null, // null if private or deleted
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      isEdited: Boolean(post.isEdited),
      isLiked: userId ? Array.isArray(post.likedBy) && post.likedBy.some(id => id.toString() === userId.toString()) : false,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }));

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
 * Edit post content.
 */
export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return res.status(400).json({ error: "Post content cannot be empty." });
    }
    if (trimmedText.length > 500) {
      return res.status(400).json({ error: "Post cannot exceed 500 characters." });
    }

    const post = await Post.findOneAndUpdate(
      { _id: id, author: userId },
      { $set: { text: trimmedText, isEdited: true } },
      { new: true }
    )
      .populate('author', 'username displayName avatarUrl role bio')
      .populate({
        path: 'space',
        match: { visibility: 'public' },
        select: 'name description tool thumbnail visibility starsCount viewsCount tags iconKey owner',
        populate: { path: 'owner', select: 'username displayName avatarUrl' }
      })
      .lean();

    if (!post) {
      return res.status(404).json({ error: "Post not found or unauthorized." });
    }

    return res.json({
      ...post,
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
      updatedPost = await Post.findByIdAndUpdate(
        id,
        {
          $pull: { likedBy: userId },
          $inc: { likesCount: -1 }
        },
        { new: true }
      );
    } else {
      updatedPost = await Post.findByIdAndUpdate(
        id,
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
            snippet: post.text.slice(0, 60),
            text: `liked your post: "${post.text.slice(0, 50)}..."`
          }
        });
      }
    }

    if (updatedPost.likesCount < 0) {
      updatedPost.likesCount = 0;
      await updatedPost.save();
    }

    return res.json({
      _id: updatedPost._id,
      likesCount: updatedPost.likesCount,
      isLiked: !isLiked
    });
  } catch (err) {
    console.error("toggleLikePost error:", err);
    return res.status(500).json({ error: "Failed to like post." });
  }
};

/**
 * GET /api/community/posts/:id/comments
 */
export const getPostComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [comments, total] = await Promise.all([
      PostComment.find({ post: id })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limitNum)
        .populate('author', 'username displayName avatarUrl role')
        .lean(),
      PostComment.countDocuments({ post: id })
    ]);

    return res.json({ comments, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
  } catch (err) {
    console.error("getPostComments error:", err);
    return res.status(500).json({ error: "Failed to load comments." });
  }
};

/**
 * POST /api/community/posts/:id/comments
 */
export const createPostComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
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

    const comment = await PostComment.create({
      post: id,
      author: userId,
      text: trimmedText
    });

    await Post.findByIdAndUpdate(id, { $inc: { commentsCount: 1 } });

    const populatedComment = await PostComment.findById(comment._id)
      .populate('author', 'username displayName avatarUrl role')
      .lean();

    // Notify post author if not self-comment
    if (post.author.toString() !== userId.toString()) {
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

    return res.status(201).json(populatedComment);
  } catch (err) {
    console.error("createPostComment error:", err);
    return res.status(500).json({ error: "Failed to add comment." });
  }
};

/**
 * DELETE /api/community/comments/:id
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

    await PostComment.findByIdAndDelete(id);
    await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -1 } });

    return res.json({ message: "Comment deleted." });
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
      return res.json({ message: "Already following.", isFollowing: true });
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

    return res.status(201).json({ message: "Followed successfully.", isFollowing: true });
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
    return res.json({ message: "Unfollowed successfully.", isFollowing: false });
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
    const [publicSpaces, followersCount, followingCount, isFollowing] = await Promise.all([
      Space.find({ owner: user._id, visibility: 'public' })
        .select('name description tool thumbnail visibility starsCount viewsCount tags iconKey createdAt')
        .sort({ starsCount: -1, updatedAt: -1 })
        .lean(),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      currentUserId ? Follow.exists({ follower: currentUserId, following: user._id }) : false
    ]);

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
        isFollowing: Boolean(isFollowing)
      },
      publicSpaces
    });
  } catch (err) {
    console.error("getPublicProfile error:", err);
    return res.status(500).json({ error: "Failed to load public profile." });
  }
};
