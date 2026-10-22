import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import User from '../models/User.js';
import Space from '../models/Space.js';
import Folder from '../models/Folder.js';
import Item from '../models/Item.js';
import CloneRequest from '../models/CloneRequest.js';
import CollaborationInvite from '../models/CollaborationInvite.js';
import Notification from '../models/Notification.js';

const BASE_URL = 'http://localhost:9000';

async function runComprehensiveTests() {
  console.log('===============================================================');
  console.log(' DevOneStack — Comprehensive Access, Clone & Inbox Test Suite ');
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
  let ownerUser, clonerUser, collaboratorUser;
  let ownerToken, clonerToken, collabToken;
  let clientOwner, clientCloner, clientCollab, clientGuest;

  try {
    // 1. Create 3 test users with verified email and age >= 24h
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    ownerUser = await User.create({
      username: `owner_${ts}`,
      email: `owner_${ts}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
      createdAt: twoDaysAgo
    });

    clonerUser = await User.create({
      username: `cloner_${ts}`,
      email: `cloner_${ts}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
      createdAt: twoDaysAgo
    });

    collaboratorUser = await User.create({
      username: `collab_${ts}`,
      email: `collab_${ts}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
      createdAt: twoDaysAgo
    });

    ownerToken = jwt.sign({ userId: ownerUser._id.toString(), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    clonerToken = jwt.sign({ userId: clonerUser._id.toString(), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    collabToken = jwt.sign({ userId: collaboratorUser._id.toString(), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    clientOwner = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${ownerToken}` } });
    clientCloner = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${clonerToken}` } });
    clientCollab = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${collabToken}` } });
    clientGuest = axios.create({ baseURL: BASE_URL });

    console.log('\n--- SECTION 1: Space Access & Central Authorization ---');
    // Owner creates a private space
    const privateSpaceRes = await clientOwner.post('/api/spaces', {
      name: `Private Hub ${ts}`,
      visibility: 'private'
    });
    const privateSpaceId = privateSpaceRes.data._id;
    assert(privateSpaceRes.data.visibility === 'private', 'Space starts in Private state');

    // Guest receives 404 for private space
    let guestCanViewPrivate = false;
    try {
      await clientGuest.get(`/api/spaces/${privateSpaceId}`);
      guestCanViewPrivate = true;
    } catch (err) {
      assert(err.response?.status === 404, 'Guest is blocked with 404 from private space');
    }
    assert(!guestCanViewPrivate, 'Private space is inaccessible to guest');

    // Cloner receives 404 for private space
    let clonerCanViewPrivate = false;
    try {
      await clientCloner.get(`/api/spaces/${privateSpaceId}`);
      clonerCanViewPrivate = true;
    } catch (err) {
      assert(err.response?.status === 404, 'Non-collaborator is blocked with 404 from private space');
    }
    assert(!clonerCanViewPrivate, 'Private space is inaccessible to non-collaborators');

    // Owner cannot star own private space
    try {
      await clientOwner.post(`/api/spaces/${privateSpaceId}/star`);
      assert(false, 'Owner should not be able to star private space');
    } catch (err) {
      assert(err.response?.status === 400, 'Starring private space is rejected with 400');
    }

    // Owner creates a public space
    const publicSpaceRes = await clientOwner.post('/api/spaces', {
      name: `Public Showcase ${ts}`,
      visibility: 'public'
    });
    const publicSpaceId = publicSpaceRes.data._id;
    assert(publicSpaceRes.data.visibility === 'public', 'Public space created successfully');

    // Guest can view public space
    const guestPublicView = await clientGuest.get(`/api/spaces/${publicSpaceId}`);
    assert(guestPublicView.status === 200 && guestPublicView.data._id === publicSpaceId, 'Guest can view public space');

    // Cloner stars public space
    const starRes = await clientCloner.post(`/api/spaces/${publicSpaceId}/star`);
    assert(starRes.data.starsCount === 1, 'Logged-in user can star public space');

    // Owner cannot self-star public space
    try {
      await clientOwner.post(`/api/spaces/${publicSpaceId}/star`);
      assert(false, 'Owner should not be able to star own space');
    } catch (err) {
      assert(err.response?.status === 400, 'Self-starring is prevented with 400');
    }

    console.log('\n--- SECTION 2: Request-Link Generation, Hashing & Landing Page ---');
    // Enable request link on private space
    const reqLinkRes = await clientOwner.post(`/api/spaces/${privateSpaceId}/request-link`, {
      enabled: true,
      description: 'Request a copy of this private research'
    });
    const plaintextToken = reqLinkRes.data.requestLinkToken;
    assert(Boolean(plaintextToken && plaintextToken.length >= 32), 'Plaintext 128-bit token returned on generation');

    // Verify token is stored hashed in MongoDB
    const dbSpace = await Space.findById(privateSpaceId).lean();
    const expectedHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');
    assert(dbSpace.requestLinkToken === expectedHash, 'Token is cryptographically hashed in database');

    // Fetch request link landing page info
    const landingRes = await clientGuest.get(`/api/clone/request-link/${plaintextToken}`);
    assert(landingRes.status === 200, 'Request link landing info accessible by token');
    assert(landingRes.data.spaceName === `Private Hub ${ts}`, 'Landing page returns space name');
    assert(landingRes.data.ownerUsername === `owner_${ts}`, 'Landing page returns owner username');
    assert(!landingRes.data.items && !landingRes.data.folders, 'No private folders or items leaked in landing info');
    assert(landingRes.headers['x-robots-tag'] === 'noindex, nofollow', 'X-Robots-Tag: noindex, nofollow header enforced');
    assert(landingRes.headers['referrer-policy'] === 'no-referrer', 'Referrer-Policy: no-referrer header enforced');

    console.log('\n--- SECTION 3: Request Lifecycle, Limits, Cooldowns & Revocation ---');
    // Cloner submits request
    const createReqRes = await clientCloner.post('/api/clone/request', {
      token: plaintextToken,
      message: 'Would love to study this'
    });
    const cloneReqId = createReqRes.data.request._id;
    assert(createReqRes.status === 201, 'Clone request submitted successfully');

    // Duplicate pending request is blocked
    try {
      await clientCloner.post('/api/clone/request', { token: plaintextToken });
      assert(false, 'Duplicate pending request should be blocked');
    } catch (err) {
      assert(err.response?.status === 400, 'Duplicate pending request blocked with 400');
    }

    // Requester withdraws request
    const withdrawRes = await clientCloner.post(`/api/inbox/requests/${cloneReqId}/action`, {
      action: 'withdraw'
    });
    assert(withdrawRes.data.request.status === 'withdrawn', 'Requester can withdraw pending request');

    // Re-submit request after withdrawal
    const resubmitRes = await clientCloner.post('/api/clone/request', {
      token: plaintextToken,
      message: 'Re-requesting access'
    });
    const newReqId = resubmitRes.data.request._id;
    assert(resubmitRes.status === 201, 'Request can be re-submitted after withdrawal');

    // Owner accepts request with 7-day expiry
    const acceptRes = await clientOwner.post(`/api/inbox/requests/${newReqId}/action`, {
      action: 'accept',
      permissions: { allowPublishing: false, allowCollaborators: false, allowOthersToClone: false }
    });
    assert(acceptRes.data.request.status === 'accepted', 'Owner accepts request');
    const expiryDate = new Date(acceptRes.data.request.expiresAt);
    const daysUntilExpiry = Math.round((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    assert(daysUntilExpiry >= 6 && daysUntilExpiry <= 8, 'Approval expires in 7 days');

    // Owner can revoke accepted request before cloning starts
    const revokeRes = await clientOwner.post(`/api/inbox/requests/${newReqId}/action`, {
      action: 'revoke'
    });
    assert(revokeRes.data.request.status === 'revoked', 'Owner can revoke approval before cloning starts');

    // Re-submit for cooldown test
    await clientCloner.post('/api/clone/request', { token: plaintextToken, message: 'Try again' });
    const reqForReject = await CloneRequest.findOne({ requester: clonerUser._id, space: privateSpaceId });

    // 1st Rejection -> 7 days cooldown
    await clientOwner.post(`/api/inbox/requests/${reqForReject._id}/action`, { action: 'reject' });
    try {
      await clientCloner.post('/api/clone/request', { token: plaintextToken });
      assert(false, 'Should be blocked by rejection cooldown');
    } catch (err) {
      assert(err.response?.status === 429, '7-day rejection cooldown enforced with 429');
    }

    // Simulate cooldown expired and 2nd rejection -> 30 days cooldown
    reqForReject.rejectionCooldownUntil = new Date(Date.now() - 1000);
    await reqForReject.save();
    await clientCloner.post('/api/clone/request', { token: plaintextToken });
    const reqForReject2 = await CloneRequest.findOne({ requester: clonerUser._id, space: privateSpaceId });
    await clientOwner.post(`/api/inbox/requests/${reqForReject2._id}/action`, { action: 'reject' });
    const rejectedReq2 = await CloneRequest.findById(reqForReject2._id);
    const cooldownDays2 = Math.round((new Date(rejectedReq2.rejectionCooldownUntil) - new Date()) / (1000 * 60 * 60 * 24));
    assert(cooldownDays2 >= 28 && cooldownDays2 <= 31, '2nd rejection triggers 30-day cooldown');

    console.log('\n--- SECTION 4: Direct Public Space Cloning & Permission Defaults ---');
    // Direct clone of public space
    const publicCloneRes = await clientCloner.post(`/api/clone/public/${publicSpaceId}`);
    assert(publicCloneRes.status === 201, 'Public space cloned directly');
    const publicClone = publicCloneRes.data.space;
    assert(publicClone.visibility === 'private', 'Public space clone starts in Private state');
    assert(publicClone.clonePermissions?.allowPublishing === false, 'Public clone: allowPublishing defaults to OFF');
    assert(publicClone.clonePermissions?.allowCollaborators === false, 'Public clone: allowCollaborators defaults to OFF');
    assert(publicClone.clonePermissions?.allowOthersToClone === false, 'Public clone: allowOthersToClone defaults to OFF');
    assert(publicClone.allowCloning === false, 'Public clone: further cloning blocked');

    // Owner cannot clone their own public space
    try {
      await clientOwner.post(`/api/clone/public/${publicSpaceId}`);
      assert(false, 'Owner self-clone should be rejected');
    } catch (err) {
      assert(err.response?.status === 400, 'Owner self-clone rejected with 400');
    }

    console.log('\n--- SECTION 5: The 8-Combination Clone Permission Matrix ---');
    // Matrix test helper
    const testCases = [
      { pub: false, col: false, clo: false },
      { pub: false, col: false, clo: true },
      { pub: false, col: true, clo: false },
      { pub: false, col: true, clo: true },
      { pub: true, col: false, clo: false },
      { pub: true, col: false, clo: true },
      { pub: true, col: true, clo: false },
      { pub: true, col: true, clo: true },
    ];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const testSpace = await Space.create({
        owner: ownerUser._id,
        name: `Matrix Space ${i} ${ts}`,
        visibility: 'private',
        requestLinkEnabled: true,
        requestLinkToken: `token_matrix_${i}_${ts}`
      });

      // Cloner creates clone request
      const reqDoc = await CloneRequest.create({
        space: testSpace._id,
        owner: ownerUser._id,
        requester: clonerUser._id,
        status: 'accepted',
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        permissions: {
          allowPublishing: tc.pub,
          allowCollaborators: tc.col,
          allowOthersToClone: tc.clo
        }
      });

      // Execute approved clone
      const execRes = await clientCloner.post(`/api/clone/execute/${reqDoc._id}`);
      assert(execRes.status === 201, `Combination ${i + 1} [P:${tc.pub ? 1 : 0}, C:${tc.col ? 1 : 0}, O:${tc.clo ? 1 : 0}] cloned`);
      const clonedId = execRes.data.space._id;

      // Test Publication permission
      let pubSuccess = false;
      try {
        await clientCloner.patch(`/api/spaces/${clonedId}`, { visibility: 'public' });
        pubSuccess = true;
      } catch (err) {
        pubSuccess = false;
      }
      assert(pubSuccess === tc.pub, `Publish permission respected: expected ${tc.pub}, got ${pubSuccess}`);

      // Test Collaborators permission
      let colSuccess = false;
      try {
        await clientCloner.post(`/api/spaces/${clonedId}/collaborators/invite`, {
          username: collaboratorUser.username,
          role: 'viewer'
        });
        colSuccess = true;
      } catch (err) {
        colSuccess = false;
      }
      assert(colSuccess === tc.col, `Collaborators permission respected: expected ${tc.col}, got ${colSuccess}`);

      // Test Further Cloning permission
      let cloSuccess = false;
      try {
        await clientCloner.post(`/api/spaces/${clonedId}/request-link`, { enabled: true });
        cloSuccess = true;
      } catch (err) {
        cloSuccess = false;
      }
      assert(cloSuccess === tc.clo, `Others-to-clone permission respected: expected ${tc.clo}, got ${cloSuccess}`);
    }

    console.log('\n--- SECTION 6: Collaborator Roles & Limit (Max 10) ---');
    const collabSpace = await Space.create({
      owner: ownerUser._id,
      name: `Collab Space ${ts}`,
      visibility: 'private'
    });

    // Invite collaborator as viewer
    const inviteRes = await clientOwner.post(`/api/spaces/${collabSpace._id}/collaborators/invite`, {
      username: collaboratorUser.username,
      role: 'viewer'
    });
    assert(inviteRes.status === 201, 'Collaborator invitation sent');
    const inviteId = inviteRes.data.invite._id;

    // Collab accepts invite
    await clientCollab.post(`/api/inbox/invitations/${inviteId}/action`, { action: 'accept' });

    // Viewer can view space
    const viewerSpaceView = await clientCollab.get(`/api/spaces/${collabSpace._id}`);
    assert(viewerSpaceView.status === 200, 'Accepted viewer can view private space');

    // Viewer blocked from adding items
    try {
      await clientCollab.post(`/api/spaces/${collabSpace._id}/items`, { title: 'Illegal Note', type: 'note' });
      assert(false, 'Viewer should not be able to create items');
    } catch (err) {
      assert([403, 404].includes(err.response?.status), 'Viewer blocked from creating items with 403 or 404');
    }

    // Promote to Editor
    await clientOwner.patch(`/api/spaces/${collabSpace._id}/collaborators/${collaboratorUser._id}`, { role: 'editor' });

    // Editor can create item
    const editorItemRes = await clientCollab.post(`/api/spaces/${collabSpace._id}/items`, { title: 'Editor Note', type: 'note' });
    assert(editorItemRes.status === 201, 'Editor collaborator can create items');

    // Editor cannot change visibility (owner only)
    try {
      await clientCollab.patch(`/api/spaces/${collabSpace._id}`, { visibility: 'public' });
      assert(false, 'Editor should not be able to change space visibility');
    } catch (err) {
      assert(err.response?.status === 404, 'Editor blocked from managing space visibility');
    }

    console.log('\n--- SECTION 7: Inbox Unread Counts & Isolation ---');
    const unreadRes = await clientOwner.get('/api/inbox/unread-count');
    assert(unreadRes.status === 200, 'Inbox unread counts retrieved');
    assert(unreadRes.data.requestsCount !== undefined && unreadRes.data.requests !== undefined, 'Requests unread count returned in both naming conventions');
    assert(unreadRes.data.invitationsCount !== undefined && unreadRes.data.invitations !== undefined, 'Invitations unread count returned in both naming conventions');
    assert(unreadRes.data.notificationsCount !== undefined && unreadRes.data.notifications !== undefined, 'Notifications unread count returned in both naming conventions');
    assert(unreadRes.data.totalUnread !== undefined && unreadRes.data.total !== undefined, 'Total unread returned in both naming conventions');

    // Clean up test data
    await User.deleteMany({ _id: { $in: [ownerUser._id, clonerUser._id, collaboratorUser._id] } });
    await Space.deleteMany({ owner: { $in: [ownerUser._id, clonerUser._id, collaboratorUser._id] } });
    await Item.deleteMany({ owner: { $in: [ownerUser._id, clonerUser._id, collaboratorUser._id] } });
    await CloneRequest.deleteMany({ $or: [{ owner: ownerUser._id }, { requester: clonerUser._id }] });
    await CollaborationInvite.deleteMany({ $or: [{ inviter: ownerUser._id }, { invitee: collaboratorUser._id }] });
    await Notification.deleteMany({ $or: [{ recipient: ownerUser._id }, { recipient: clonerUser._id }, { recipient: collaboratorUser._id }] });

  } catch (err) {
    console.error('Fatal test error:', err.response?.data || err.message || err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n===============================================================');
    console.log(` COMPREHENSIVE TEST RESULTS: ${passed} PASSED, ${failed} FAILED `);
    console.log('===============================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runComprehensiveTests();
