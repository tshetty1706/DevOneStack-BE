import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import User from '../models/User.js';
import Post from '../models/Post.js';
import PostComment from '../models/PostComment.js';
import Follow from '../models/Follow.js';
import Notification from '../models/Notification.js';

const BASE_URL = 'http://localhost:9000';

async function runCommunitySocialTests() {
  console.log('===============================================================');
  console.log(' DevOneStack — Community Feed, Comments, Replies & Follow Tests ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[INFO] Connected to MongoDB');

  const ts = Date.now();
  let userA, userB, userC;
  let tokenA, tokenB, tokenC;
  let clientA, clientB, clientC;

  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    userA = await User.create({
      username: `user_a_${ts}`,
      email: `user_a_${ts}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
      createdAt: twoDaysAgo
    });

    userB = await User.create({
      username: `user_b_${ts}`,
      email: `user_b_${ts}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
      createdAt: twoDaysAgo
    });

    userC = await User.create({
      username: `user_c_${ts}`,
      email: `user_c_${ts}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
      createdAt: twoDaysAgo
    });

    tokenA = jwt.sign({ userId: userA._id.toString(), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokenB = jwt.sign({ userId: userB._id.toString(), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokenC = jwt.sign({ userId: userC._id.toString(), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    clientA = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${tokenA}` } });
    clientB = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${tokenB}` } });
    clientC = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${tokenC}` } });

    console.log('\n--- SECTION 1: Follow / Unfollow Lifecycle & Notifications ---');

    // 1. Prevent self-following
    let selfFollowBlocked = false;
    try {
      await clientA.post(`/api/community/follow/${userA._id}`);
    } catch (err) {
      selfFollowBlocked = err.response?.status === 400;
    }
    assert(selfFollowBlocked, 'Prevent users from following themselves (400 Bad Request)');

    // 2. Follow user B
    const followRes = await clientA.post(`/api/community/follow/${userB._id}`);
    assert(followRes.data.following === true, 'User A successfully follows User B');

    // 3. Follow count persistence in database
    const dbFollow = await Follow.findOne({ follower: userA._id, following: userB._id });
    assert(!!dbFollow, 'Follow relationship persisted in database');

    // 4. Notification generated for followed user (User B)
    const followNotifs = await Notification.find({ recipient: userB._id, category: 'new_follower' });
    assert(followNotifs.length === 1, 'Follow notification created for User B');

    // 5. Repeated follow is idempotent and does not create duplicate relationship or duplicate notification
    const repeatFollowRes = await clientA.post(`/api/community/follow/${userB._id}`);
    assert(repeatFollowRes.data.following === true, 'Repeated follow request returns following: true');
    const dbFollowsCount = await Follow.countDocuments({ follower: userA._id, following: userB._id });
    assert(dbFollowsCount === 1, 'No duplicate follow records in database');
    const repeatNotifs = await Notification.find({ recipient: userB._id, category: 'new_follower' });
    assert(repeatNotifs.length === 1, 'No duplicate follow notifications generated');

    // 6. Unfollow user B
    const unfollowRes = await clientA.post(`/api/community/unfollow/${userB._id}`);
    assert(unfollowRes.data.following === false, 'User A successfully unfollows User B');
    const dbFollowAfter = await Follow.findOne({ follower: userA._id, following: userB._id });
    assert(!dbFollowAfter, 'Follow record removed from database on unfollow');

    console.log('\n--- SECTION 2: Posts & Reliable Atomic Likes ---');

    // Create post by User B
    const postRes = await clientB.post('/api/community/posts', {
      text: 'This is a test post description for architecture verification.'
    });
    const postId = postRes.data.post?._id || postRes.data._id;
    assert(!!postId, 'User B created a community post');

    // User A likes post
    const likeRes1 = await clientA.post(`/api/community/posts/${postId}/like`);
    assert(likeRes1.data.liked === true && likeRes1.data.likesCount === 1, 'User A liked post (count = 1)');

    // Check DB state
    const postInDb1 = await Post.findById(postId);
    assert(postInDb1.likesCount === 1 && postInDb1.likedBy.some(id => id.toString() === userA._id.toString()), 'Database reflects likedBy userA and count 1');

    // User A un-likes post
    const likeRes2 = await clientA.post(`/api/community/posts/${postId}/like`);
    assert(likeRes2.data.liked === false && likeRes2.data.likesCount === 0, 'User A unliked post (count = 0)');

    // Check DB state
    const postInDb2 = await Post.findById(postId);
    assert(postInDb2.likesCount === 0 && !postInDb2.likedBy.some(id => id.toString() === userA._id.toString()), 'Database reflects unliked post (count 0, likedBy cleared)');

    // Rapid concurrent like toggle simulation: 4 parallel toggles from User A and User C
    await Promise.all([
      clientA.post(`/api/community/posts/${postId}/like`),
      clientC.post(`/api/community/posts/${postId}/like`),
      clientA.post(`/api/community/posts/${postId}/like`),
      clientC.post(`/api/community/posts/${postId}/like`),
    ]);
    const finalPost = await Post.findById(postId);
    assert(finalPost.likesCount === finalPost.likedBy.length, `Database integrity preserved: likesCount (${finalPost.likesCount}) === likedBy array length (${finalPost.likedBy.length})`);

    console.log('\n--- SECTION 3: Comments and Single-Level Replies ---');

    // User A posts top-level comment
    const commentRes1 = await clientA.post(`/api/community/posts/${postId}/comments`, {
      text: 'Great post! This is the top-level comment.'
    });
    const comment1 = commentRes1.data.comment;
    assert(!!comment1 && comment1.text.includes('top-level'), 'User A posted top-level comment');

    // Verify post commentsCount incremented
    const postAfterComment = await Post.findById(postId);
    assert(postAfterComment.commentsCount === 1, 'Post commentsCount incremented to 1');

    // User C replies to User A comment
    const replyRes = await clientC.post(`/api/community/posts/${postId}/comments`, {
      text: 'I agree with this comment!',
      parentCommentId: comment1._id
    });
    const reply1 = replyRes.data.comment;
    assert(!!reply1 && reply1.parentComment?.toString() === comment1._id.toString(), 'User C posted reply linked to parentComment');

    // Verify post commentsCount incremented for reply
    const postAfterReply = await Post.findById(postId);
    assert(postAfterReply.commentsCount === 2, 'Post commentsCount incremented to 2 including reply');

    // Verify reply notification sent to comment author (User A)
    const replyNotif = await Notification.findOne({ recipient: userA._id, category: 'comment_reply' });
    assert(!!replyNotif, 'Reply notification sent to original comment author (User A)');

    // Fetch comments and verify nesting
    const commentsListRes = await clientA.get(`/api/community/posts/${postId}/comments`);
    const commentsList = commentsListRes.data.comments || [];
    assert(commentsList.length === 1, 'Top-level comments list has exactly 1 parent');
    assert(commentsList[0].replies && commentsList[0].replies.length === 1, 'Top-level comment includes populated replies array with 1 reply');

    // Attempting to reply to a reply flattens to top-level
    const deepReplyRes = await clientB.post(`/api/community/posts/${postId}/comments`, {
      text: 'Trying a nested reply',
      parentCommentId: reply1._id
    });
    assert(deepReplyRes.data.comment?.parentComment?.toString() === comment1._id.toString(), 'Deep nested reply flattened to level-1 parent comment');

    // User C unauthorized deletion attempt on User A's top-level comment
    let unauthDeleteBlocked = false;
    try {
      await clientC.delete(`/api/community/comments/${comment1._id}`);
    } catch (err) {
      unauthDeleteBlocked = err.response?.status === 403;
    }
    assert(unauthDeleteBlocked, 'Unauthorized user blocked from deleting other user comment (403 Forbidden)');

    // Authorized deletion of top-level comment by author User A: cascades to delete all replies
    const deleteRes = await clientA.delete(`/api/community/comments/${comment1._id}`);
    assert(deleteRes.status === 200, 'User A deleted their own top-level comment');

    // Verify cascading deletion: neither parent nor replies remain
    const remainingComments = await PostComment.find({ post: postId });
    assert(remainingComments.length === 0, 'Cascading deletion removed parent comment and all associated replies');

    const postAfterCascade = await Post.findById(postId);
    assert(postAfterCascade.commentsCount === 0, 'Post commentsCount decremented back to 0 without underflow');

    console.log('\n--- SECTION 4: Inbox Individual Read Status & Navigation ---');

    // Notification was created for User A earlier. Test marking individual notification as read.
    const notifToRead = await Notification.findOne({ recipient: userA._id });
    if (notifToRead) {
      const markReadRes = await clientA.post('/api/inbox/mark-read', {
        tab: 'notifications',
        id: notifToRead._id
      });
      assert(markReadRes.status === 200, 'Marked individual notification as read');

      const updatedNotif = await Notification.findById(notifToRead._id);
      assert(updatedNotif.read === true, 'Notification read flag persisted as true in database');
    }

  } catch (err) {
    console.error('[UNEXPECTED ERROR]', err);
    failed++;
  } finally {
    // Cleanup test data
    if (userA) {
      await User.deleteMany({ _id: { $in: [userA._id, userB._id, userC._id] } });
      await Post.deleteMany({ author: { $in: [userA._id, userB._id, userC._id] } });
      await PostComment.deleteMany({ author: { $in: [userA._id, userB._id, userC._id] } });
      await Follow.deleteMany({ follower: { $in: [userA._id, userB._id, userC._id] } });
      await Notification.deleteMany({ recipient: { $in: [userA._id, userB._id, userC._id] } });
    }
    await mongoose.disconnect();
    console.log('\n===============================================================');
    console.log(` COMMUNITY & SOCIAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED `);
    console.log('===============================================================');
    if (failed > 0) process.exit(1);
  }
}

runCommunitySocialTests();
