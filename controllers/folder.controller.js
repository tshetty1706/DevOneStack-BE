import mongoose from 'mongoose';
import Folder from '../models/Folder.js';
import Item from '../models/Item.js';
import Space from '../models/Space.js';
import Doc from '../models/Doc.js';
import Learning from '../models/Learning.js';
import Snippet from '../models/Snippet.js';
import SnippetContent from '../models/SnippetContent.js';
import Prompt from '../models/Prompt.js';
import Repo from '../models/Repo.js';
import deleteFromCloudinary from '../utils/deleteFromCloudinary.js';
import {
  verifySpaceOwnership,
  logUserHistory,
  sendError
} from '../utils/spaceHelpers.js';

/**
 * Helper to compute paths and depths for a list of folders
 */
function buildFolderHierarchy(folders) {
  const folderMap = new Map();
  folders.forEach(f => {
    folderMap.set(f._id.toString(), {
      ...f,
      _id: f._id.toString(),
      parentId: f.parentId ? f.parentId.toString() : null,
      path: f.name,
      pathArray: [f.name],
      depth: 1
    });
  });

  // Calculate full path and depth
  folderMap.forEach(item => {
    let curr = item;
    const names = [curr.name];
    let depth = 1;
    const visited = new Set([curr._id]);

    while (curr.parentId && folderMap.has(curr.parentId)) {
      if (visited.has(curr.parentId)) break; // avoid loops
      visited.add(curr.parentId);
      curr = folderMap.get(curr.parentId);
      names.unshift(curr.name);
      depth++;
    }
    item.path = names.join(' / ');
    item.pathArray = names;
    item.depth = depth;
  });

  return Array.from(folderMap.values());
}

// GET /api/spaces/:spaceId/folders
export const listFolders = async (req, res) => {
  try {
    const { spaceId } = req.params;

    // Check space access (owner or public/unlisted)
    const space = await Space.findOne({
      _id: spaceId,
      $or: [
        { owner: req.user._id },
        { visibility: { $in: ['public', 'unlisted'] } }
      ]
    }).lean();

    if (!space) return res.status(404).json({ error: 'Space not found' });

    const rawFolders = await Folder.find({ spaceId }).sort({ createdAt: 1 }).lean();
    const foldersWithPaths = buildFolderHierarchy(rawFolders);

    // Get item counts per folder
    const itemCounts = await Item.aggregate([
      { $match: { spaceId: space._id } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } }
    ]);

    const countsMap = new Map();
    itemCounts.forEach(c => {
      countsMap.set(c._id ? c._id.toString() : 'root', c.count);
    });

    const result = foldersWithPaths.map(f => ({
      ...f,
      itemCount: countsMap.get(f._id) || 0
    })).sort((a, b) => {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    res.json({ folders: result });
  } catch (err) {
    sendError(res, err, 'Failed to list folders');
  }
};

// POST /api/spaces/:spaceId/folders
export const createFolder = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { name, parentId, color } = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    let depth = 1;
    let warning = null;
    const actualParentId = parentId ? parentId.toString() : null;

    if (actualParentId) {
      const parent = await Folder.findOne({ _id: actualParentId, spaceId });
      if (!parent) return res.status(400).json({ error: 'Parent folder not found' });

      // Compute depth
      const allFolders = await Folder.find({ spaceId }).lean();
      const hierarchy = buildFolderHierarchy(allFolders);
      const parentInHierarchy = hierarchy.find(f => f._id === actualParentId);
      depth = parentInHierarchy ? parentInHierarchy.depth + 1 : 2;

      if (depth > 4) {
        return res.status(400).json({
          error: 'Folders can only be nested up to 4 levels.'
        });
      }
    }

    const folder = await Folder.create({
      owner: req.user._id,
      spaceId,
      name: trimmedName,
      parentId: actualParentId,
      color: color || '',
      isRoot: false,
    });

    await logUserHistory(
      req.user._id,
      'created_folder',
      `Created folder "${folder.name}"`,
      { spaceId, folderId: folder._id }
    );

    res.status(201).json({
      folder,
      depth,
      warning
    });
  } catch (err) {
    sendError(res, err, 'Failed to create folder');
  }
};

// PATCH /api/spaces/:spaceId/folders/:folderId
export const updateFolder = async (req, res) => {
  try {
    const { spaceId, folderId } = req.params;
    const { name, parentId, color } = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const folder = await Folder.findOne({ _id: folderId, spaceId });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: 'Folder name cannot be empty' });
      folder.name = trimmed;
    }

    if (parentId !== undefined) {
      const targetParentId = (parentId && parentId !== 'root' && parentId !== 'null') ? parentId.toString() : null;

      if (targetParentId === folderId.toString()) {
        return res.status(400).json({ error: "You can't move a folder into itself." });
      }

      const allFolders = await Folder.find({ spaceId }).lean();

      if (targetParentId) {
        // Check if targetParentId is a descendant of folderId (circular move)
        let curr = allFolders.find(f => f._id.toString() === targetParentId);
        const visited = new Set();
        while (curr && curr.parentId) {
          if (curr.parentId.toString() === folderId.toString()) {
            return res.status(400).json({ error: "You can't move a folder into one of its subfolders." });
          }
          if (visited.has(curr._id.toString())) break;
          visited.add(curr._id.toString());
          curr = allFolders.find(f => f._id.toString() === curr.parentId.toString());
        }

        // Calculate target parent's depth
        const hierarchy = buildFolderHierarchy(allFolders);
        const parentInHierarchy = hierarchy.find(f => f._id === targetParentId);
        const parentDepth = parentInHierarchy ? parentInHierarchy.depth : 1;

        // Calculate height of the subtree being moved
        function getSubtreeHeight(fId) {
          const children = allFolders.filter(f => f.parentId && f.parentId.toString() === fId.toString());
          if (children.length === 0) return 1;
          const childHeights = children.map(c => getSubtreeHeight(c._id));
          return 1 + Math.max(...childHeights);
        }

        const subtreeHeight = getSubtreeHeight(folderId);

        if (parentDepth + subtreeHeight > 4) {
          return res.status(400).json({ error: 'Folders can only be nested up to 4 levels.' });
        }
      }

      folder.parentId = targetParentId;
    }

    if (color !== undefined) {
      folder.color = color;
    }

    await folder.save();

    await logUserHistory(
      req.user._id,
      'updated_folder',
      `Updated folder "${folder.name}"`,
      { spaceId, folderId: folder._id }
    );

    res.json({ folder });
  } catch (err) {
    sendError(res, err, 'Failed to update folder');
  }
};

// DELETE /api/spaces/:spaceId/folders/:folderId
export const deleteFolder = async (req, res) => {
  try {
    const { spaceId, folderId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const folder = await Folder.findOne({ _id: folderId, spaceId });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Recursively collect all descendant folder IDs
    const allFolders = await Folder.find({ spaceId }).lean();
    const toDeleteIds = new Set([folderId.toString()]);
    let added = true;

    while (added) {
      added = false;
      allFolders.forEach(f => {
        const pId = f.parentId ? (typeof f.parentId === 'object' ? f.parentId._id : f.parentId)?.toString() : null;
        const fId = f._id ? f._id.toString() : null;
        if (pId && fId && toDeleteIds.has(pId) && !toDeleteIds.has(fId)) {
          toDeleteIds.add(fId);
          added = true;
        }
      });
    }

    const folderIdsArray = Array.from(toDeleteIds);
    const objectIdList = folderIdsArray
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    const allFolderMatchIds = [...folderIdsArray, ...objectIdList];

    // Find all items in these folders across unified Item model
    const itemsToDelete = await Item.find({
      spaceId: space._id,
      folderId: { $in: allFolderMatchIds }
    }).lean();

    // Also check legacy doc and snippet items for Cloudinary cleanup
    const [legacyDocs, legacySnippets] = await Promise.all([
      Doc.find({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }).select('_id cloudinaryPublicId type').lean(),
      Snippet.find({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }).select('_id').lean()
    ]);

    // Asynchronously delete Cloudinary files if any
    const cloudinaryItems = [
      ...itemsToDelete.filter(i => i.cloudinaryPublicId).map(i => ({ publicId: i.cloudinaryPublicId, docType: i.docType })),
      ...legacyDocs.filter(d => d.cloudinaryPublicId).map(d => ({ publicId: d.cloudinaryPublicId, docType: d.type }))
    ];

    if (cloudinaryItems.length > 0) {
      Promise.allSettled(
        cloudinaryItems.map(i =>
          deleteFromCloudinary(i.publicId, i.docType === 'pdf' ? 'raw' : 'image')
        )
      ).catch(err => console.error('Cloudinary asset deletion error:', err));
    }

    // Delete all items and folders in the subtree across all collections
    const [itemDeleteRes] = await Promise.all([
      Item.deleteMany({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }),
      Doc.deleteMany({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }),
      Learning.deleteMany({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }),
      Snippet.deleteMany({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }),
      SnippetContent.deleteMany({ snippetId: { $in: legacySnippets.map(s => s._id) } }),
      Prompt.deleteMany({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }),
      Repo.deleteMany({ spaceId: space._id, folderId: { $in: allFolderMatchIds } }),
      Folder.deleteMany({ spaceId: space._id, _id: { $in: allFolderMatchIds } })
    ]);

    // Accurately recalculate Space resource counts
    const [docsCount, notesCount, learningsCount, snippetsCount, reposCount, promptsCount, imagesCount] =
      await Promise.all([
        Item.countDocuments({ spaceId: space._id, type: 'doc' }),
        Item.countDocuments({ spaceId: space._id, type: 'note' }),
        Item.countDocuments({ spaceId: space._id, type: 'learning' }),
        Item.countDocuments({ spaceId: space._id, type: 'snippet' }),
        Item.countDocuments({ spaceId: space._id, type: 'repo' }),
        Item.countDocuments({ spaceId: space._id, type: 'prompt' }),
        Item.countDocuments({ spaceId: space._id, type: 'image' }),
      ]);

    await Space.findByIdAndUpdate(spaceId, {
      $set: {
        docsCount,
        notesCount,
        learningsCount,
        snippetsCount,
        reposCount,
        promptsCount,
        imagesCount,
        updatedAt: new Date()
      }
    });

    const totalItemsDeleted = (itemDeleteRes?.deletedCount || 0) + legacyDocs.length + legacySnippets.length;

    await logUserHistory(
      req.user._id,
      'deleted_folder',
      `Deleted folder "${folder.name}" and contents (${totalItemsDeleted} item${totalItemsDeleted === 1 ? '' : 's'})`,
      { spaceId }
    );

    res.json({
      message: 'Folder and contents deleted successfully',
      deletedFolderIds: folderIdsArray,
      deletedCount: totalItemsDeleted,
      subfoldersCount: Math.max(0, folderIdsArray.length - 1)
    });
  } catch (err) {
    sendError(res, err, 'Failed to delete folder');
  }
};
