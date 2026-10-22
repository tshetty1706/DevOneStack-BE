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
import Space from '../models/Space.js';
import Item from '../models/Item.js';

const BASE_URL = 'http://localhost:9000';

async function runTests() {
  console.log('--- Starting Multi-Account Isolation & RBAC Test Suite ---');
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
  console.log('[INFO] Connected to MongoDB for test harness setup');

  const timestamp = Date.now();
  let userA, userB, userC;
  let tokenA, tokenB, tokenC;
  let spaceId, itemId, itemBId;

  try {
    // 1. Create verified test users in MongoDB
    userA = await User.create({
      username: `usera_${timestamp}`,
      email: `usera_${timestamp}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
    });
    userB = await User.create({
      username: `userb_${timestamp}`,
      email: `userb_${timestamp}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
    });
    userC = await User.create({
      username: `userc_${timestamp}`,
      email: `userc_${timestamp}@devone.test`,
      passwordHash: 'Password123!',
      isVerified: true,
      tokenVersion: 0,
    });

    tokenA = jwt.sign({ userId: userA._id.toString(), tokenVersion: userA.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '15m' });
    tokenB = jwt.sign({ userId: userB._id.toString(), tokenVersion: userB.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '15m' });
    tokenC = jwt.sign({ userId: userC._id.toString(), tokenVersion: userC.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '15m' });

    assert(tokenA && tokenB && tokenC, 'Generated valid auth tokens for User A, User B, User C');

    const clientA = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${tokenA}` } });
    const clientB = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${tokenB}` } });
    const clientC = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${tokenC}` } });

    // 2. User A creates a Private Space via API
    const spaceRes = await clientA.post('/api/spaces', {
      name: `Private Fortress ${timestamp}`,
      visibility: 'private',
    });
    spaceId = spaceRes.data._id;
    assert(spaceId && spaceRes.data.visibility === 'private', 'User A creates private space');

    // 3. User A creates a Note item in Private Space
    const itemRes = await clientA.post(`/api/spaces/${spaceId}/items`, {
      title: 'Top Secret Note',
      content: 'Only User A should ever read this note.',
      type: 'note',
    });
    itemId = itemRes.data.item._id;
    assert(itemId && itemRes.data.item.title === 'Top Secret Note', 'User A creates note item');

    // 4. User B attempts to access User A's private space metadata
    let bCanAccessSpace = false;
    try {
      await clientB.get(`/api/spaces/${spaceId}`);
      bCanAccessSpace = true;
    } catch (err) {
      assert(err.response?.status === 404, 'User B blocked with 404 from viewing User A private space metadata');
    }
    assert(!bCanAccessSpace, 'User B cannot view User A private space');

    // 5. User B attempts to list items of User A's private space
    let bCanListItems = false;
    try {
      await clientB.get(`/api/spaces/${spaceId}/items`);
      bCanListItems = true;
    } catch (err) {
      assert(err.response?.status === 404, 'User B blocked with 404 from listing items in User A private space');
    }
    assert(!bCanListItems, 'User B cannot list items from User A private space');

    // 6. User B attempts to create item in User A's space
    let bCanCreateItem = false;
    try {
      await clientB.post(`/api/spaces/${spaceId}/items`, {
        title: 'Hacker item',
        type: 'note',
      });
      bCanCreateItem = true;
    } catch (err) {
      assert(err.response?.status === 404, 'User B blocked with 404 from creating items in User A space');
    }
    assert(!bCanCreateItem, 'User B cannot inject items into User A space');

    // 7. User B calls GET /api/spaces -> User A's space must not leak
    const bSpacesRes = await clientB.get('/api/spaces');
    const leaked = bSpacesRes.data.some(s => s._id.toString() === spaceId.toString());
    assert(!leaked, "User A's private space is excluded from User B's /api/spaces list");

    // 8. Add User B as 'editor' collaborator
    await Space.findByIdAndUpdate(spaceId, {
      $push: { collaborators: { user: userB._id, role: 'editor' } }
    });

    // 9. User B (editor) can now view the space and items
    const bCollabSpaceRes = await clientB.get(`/api/spaces/${spaceId}`);
    assert(bCollabSpaceRes.data._id === spaceId, 'User B (editor collaborator) can view shared space');

    const bCollabItemsRes = await clientB.get(`/api/spaces/${spaceId}/items`);
    const foundItem = bCollabItemsRes.data.items?.some(i => i._id.toString() === itemId.toString());
    assert(foundItem, 'User B (editor collaborator) can view items in shared space');

    // 10. User B (editor) can create an item in the space
    const bNewItemRes = await clientB.post(`/api/spaces/${spaceId}/items`, {
      title: 'Editor Note by User B',
      type: 'note',
    });
    itemBId = bNewItemRes.data.item?._id;
    assert(itemBId, 'User B (editor collaborator) creates item in shared space');

    // 11. User B (editor) can edit items in the space
    const bUpdateItemRes = await clientB.patch(`/api/spaces/${spaceId}/items/${itemId}`, {
      title: 'Top Secret Note (Collaborator Reviewed)',
    });
    assert(bUpdateItemRes.data.item?.title.includes('Collaborator Reviewed'), 'User B (editor collaborator) successfully updates item');

    // 12. Add User C as 'viewer' collaborator
    await Space.findByIdAndUpdate(spaceId, {
      $push: { collaborators: { user: userC._id, role: 'viewer' } }
    });

    // 13. User C (viewer) can view space and items
    const cCollabSpaceRes = await clientC.get(`/api/spaces/${spaceId}`);
    assert(cCollabSpaceRes.data._id === spaceId, 'User C (viewer collaborator) can view shared space');

    const cCollabItemsRes = await clientC.get(`/api/spaces/${spaceId}/items`);
    assert(cCollabItemsRes.data.items?.length >= 2, 'User C (viewer collaborator) can list items');

    // 14. User C (viewer) CANNOT create an item
    let cCanCreateItem = false;
    try {
      await clientC.post(`/api/spaces/${spaceId}/items`, {
        title: 'Viewer unauthorized creation',
        type: 'note',
      });
      cCanCreateItem = true;
    } catch (err) {
      assert(err.response?.status === 404, 'User C (viewer) blocked from creating items');
    }
    assert(!cCanCreateItem, 'Viewer role correctly prevented from creating items in space');

    // 15. User C (viewer) CANNOT delete an item
    let cCanDeleteItem = false;
    try {
      await clientC.delete(`/api/spaces/${spaceId}/items/${itemId}`);
      cCanDeleteItem = true;
    } catch (err) {
      assert(err.response?.status === 404, 'User C (viewer) blocked from deleting items');
    }
    assert(!cCanDeleteItem, 'Viewer role correctly prevented from deleting items in space');

    // 16. User A Logout and Session Invalidation
    const logoutRes = await clientA.post('/api/auth/logout');
    assert(logoutRes.status === 200, 'User A logs out successfully');

    // Simulate tokenVersion revocation check
    await User.findByIdAndUpdate(userA._id, { $inc: { tokenVersion: 1 } });

    let oldTokenAllowed = false;
    try {
      await clientA.get('/api/auth/me');
      oldTokenAllowed = true;
    } catch (err) {
      assert(err.response?.status === 401, 'Old access token rejected after session revocation');
    }
    assert(!oldTokenAllowed, 'Revoked token rejected with 401');

  } catch (err) {
    console.error('Test execution error:', err.response?.data || err.message);
    failed++;
  } finally {
    // Cleanup test artifacts
    if (spaceId) {
      await Item.deleteMany({ spaceId });
      await Space.findByIdAndDelete(spaceId);
    }
    if (userA) await User.findByIdAndDelete(userA._id);
    if (userB) await User.findByIdAndDelete(userB._id);
    if (userC) await User.findByIdAndDelete(userC._id);
    await mongoose.disconnect();
  }

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
