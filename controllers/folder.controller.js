import Folder from '../models/Folder.js';
import Item from '../models/Item.js';
import Space from '../models/Space.js';
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

    let rawFolders = await Folder.find({ spaceId }).sort({ name: 1 }).lean();

    // Auto-create a default workspace folder if space has 0 folders
    if (rawFolders.length === 0 && space.owner.toString() === req.user._id.toString()) {
      const defaultFolder = await Folder.create({
        owner: req.user._id,
        spaceId,
        name: 'Workspace',
        parentId: null,
      });
      rawFolders = [defaultFolder.toObject()];
    }

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
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

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

    if (parentId) {
      const parent = await Folder.findOne({ _id: parentId, spaceId });
      if (!parent) return res.status(400).json({ error: 'Parent folder not found' });

      // Compute depth
      const allFolders = await Folder.find({ spaceId }).lean();
      const hierarchy = buildFolderHierarchy(allFolders);
      const parentInHierarchy = hierarchy.find(f => f._id === parentId.toString());
      depth = parentInHierarchy ? parentInHierarchy.depth + 1 : 2;

      if (depth >= 4) {
        warning = 'Nesting depth is 4+ levels deep. Consider using tags for faster navigation.';
      }
    }

    const folder = await Folder.create({
      owner: req.user._id,
      spaceId,
      name: trimmedName,
      parentId: parentId || null,
      color: color || '',
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
      if (parentId === folderId) {
        return res.status(400).json({ error: 'A folder cannot be its own parent' });
      }
      folder.parentId = parentId || null;
    }

    if (color !== undefined) {
      folder.color = color;
    }

    await folder.save();

    await logUserHistory(
      req.user._id,
      'updated_folder',
      `Renamed folder to "${folder.name}"`,
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
        if (f.parentId && toDeleteIds.has(f.parentId.toString()) && !toDeleteIds.has(f._id.toString())) {
          toDeleteIds.add(f._id.toString());
          added = true;
        }
      });
    }

    const folderIdsArray = Array.from(toDeleteIds);

    // Delete all items in these folders
    const itemsToDelete = await Item.find({ spaceId, folderId: { $in: folderIdsArray } });
    
    // Decrement space counts accordingly
    for (const itm of itemsToDelete) {
      const countField = `${itm.type}sCount`;
      if (space[countField] !== undefined) {
        await Space.findByIdAndUpdate(spaceId, { $inc: { [countField]: -1 } });
      }
    }

    await Item.deleteMany({ spaceId, folderId: { $in: folderIdsArray } });
    await Folder.deleteMany({ spaceId, _id: { $in: folderIdsArray } });

    await logUserHistory(
      req.user._id,
      'deleted_folder',
      `Deleted folder "${folder.name}" and contents`,
      { spaceId }
    );

    res.json({ message: 'Folder and contents deleted successfully', deletedFolderIds: folderIdsArray });
  } catch (err) {
    sendError(res, err, 'Failed to delete folder');
  }
};
