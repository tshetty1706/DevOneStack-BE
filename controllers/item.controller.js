import Item from '../models/Item.js';
import Folder from '../models/Folder.js';
import Space from '../models/Space.js';
import Doc from '../models/Doc.js';
import Learning from '../models/Learning.js';
import Snippet from '../models/Snippet.js';
import SnippetContent from '../models/SnippetContent.js';
import Prompt from '../models/Prompt.js';
import Repo from '../models/Repo.js';
import {
  verifySpaceOwnership,
  updateSpaceResourceCount,
  logUserHistory,
  parseTags,
  sendError
} from '../utils/spaceHelpers.js';

/**
 * Build folder map for fast path lookup
 */
async function getFolderPathMap(spaceId) {
  const folders = await Folder.find({ spaceId }).lean();
  const folderMap = new Map();
  folders.forEach(f => {
    folderMap.set(f._id.toString(), {
      _id: f._id.toString(),
      name: f.name,
      parentId: f.parentId ? f.parentId.toString() : null,
    });
  });

  const pathMap = new Map();
  folderMap.forEach((f, id) => {
    let curr = f;
    const parts = [curr.name];
    const visited = new Set([id]);
    while (curr.parentId && folderMap.has(curr.parentId)) {
      if (visited.has(curr.parentId)) break;
      visited.add(curr.parentId);
      curr = folderMap.get(curr.parentId);
      parts.unshift(curr.name);
    }
    pathMap.set(id, {
      name: f.name,
      path: parts.join(' / '),
      pathArray: parts
    });
  });

  return pathMap;
}

/**
 * One-time background sync from legacy collections if Space has legacy data but 0 Items
 */
async function autoMigrateLegacyItems(spaceId, ownerId) {
  try {
    const itemCount = await Item.countDocuments({ spaceId });
    if (itemCount > 0) return;

    let defaultFolder = await Folder.findOne({ spaceId });
    if (!defaultFolder) {
      defaultFolder = await Folder.create({
        owner: ownerId,
        spaceId,
        name: 'Workspace',
        parentId: null
      });
    }

    const folderId = defaultFolder._id;

    // Migrate Docs
    const docs = await Doc.find({ spaceId }).lean();
    for (const d of docs) {
      await Item.create({
        owner: ownerId,
        spaceId,
        folderId,
        title: d.title || 'Untitled Doc',
        type: d.type === 'image' ? 'image' : 'doc',
        docType: d.type || 'url',
        url: d.url || '',
        cloudinaryUrl: d.cloudinaryUrl || '',
        cloudinaryPublicId: d.cloudinaryPublicId || '',
        format: d.format || '',
        fileSize: d.fileSize || 0,
        caption: d.caption || '',
        tags: d.tags || [],
        isPinned: d.isPinned || false,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      });
    }

    // Migrate Snippets
    const snippets = await Snippet.find({ spaceId }).lean();
    for (const s of snippets) {
      const contentDoc = await SnippetContent.findOne({ snippetId: s._id }).lean();
      await Item.create({
        owner: ownerId,
        spaceId,
        folderId,
        title: s.name || 'Untitled Snippet',
        type: 'snippet',
        content: contentDoc?.code || '',
        language: s.language || 'javascript',
        caption: s.caption || '',
        preview: s.preview || '',
        tags: s.tags || [],
        isPinned: s.isPinned || false,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      });
    }

    // Migrate Learnings
    const learnings = await Learning.find({ spaceId }).lean();
    for (const l of learnings) {
      await Item.create({
        owner: ownerId,
        spaceId,
        folderId,
        title: l.title || 'Untitled Learning',
        type: 'learning',
        learningType: l.type || 'learning',
        content: l.content || '',
        codeExample: l.codeExample || null,
        tags: l.tags || [],
        isPinned: l.isPinned || false,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt
      });
    }

    // Migrate Prompts
    const prompts = await Prompt.find({ spaceId }).lean();
    for (const p of prompts) {
      await Item.create({
        owner: ownerId,
        spaceId,
        folderId,
        title: p.title || 'Untitled Prompt',
        type: 'prompt',
        content: p.body || '',
        caption: p.caption || '',
        model: p.model || 'GPT-4o',
        tags: p.tags || [],
        isPinned: p.isPinned || false,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      });
    }

    // Migrate Repos
    const repos = await Repo.find({ spaceId }).lean();
    for (const r of repos) {
      await Item.create({
        owner: ownerId,
        spaceId,
        folderId,
        title: r.name || 'Untitled Repo',
        type: 'repo',
        url: r.url || '',
        caption: r.description || '',
        tags: r.tags || [],
        isPinned: r.isPinned || false,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      });
    }
  } catch (err) {
    console.error('autoMigrateLegacyItems error:', err);
  }
}

// GET /api/spaces/:spaceId/items
export const listItems = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { type, folderId, search, tag, sort } = req.query;

    const space = await Space.findOne({
      _id: spaceId,
      $or: [
        { owner: req.user._id },
        { visibility: { $in: ['public', 'unlisted'] } }
      ]
    }).lean();

    if (!space) return res.status(404).json({ error: 'Space not found' });

    // Ensure migration if needed
    await autoMigrateLegacyItems(spaceId, req.user._id);

    const filter = { spaceId };
    if (type && type !== 'all') {
      filter.type = type;
    }
    if (folderId && folderId !== 'all') {
      if (folderId === 'root' || folderId === 'null') {
        filter.folderId = null;
      } else {
        filter.folderId = folderId;
      }
    }
    if (tag) {
      filter.tags = tag.toLowerCase().trim();
    }
    if (search) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { caption: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }

    const items = await Item.find(filter)
      .sort({ isPinned: -1, title: 1, updatedAt: -1 })
      .lean();

    const pathMap = await getFolderPathMap(spaceId);

    const enrichedItems = items.map(itm => {
      const folderInfo = itm.folderId ? pathMap.get(itm.folderId.toString()) : null;
      return {
        ...itm,
        folderName: folderInfo?.name || 'Workspace',
        folderPath: folderInfo?.path || 'Workspace',
        folderPathArray: folderInfo?.pathArray || ['Workspace']
      };
    }).sort((a, b) => {
      // Pinned first, then alphabetical
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    });

    res.json({ items: enrichedItems });
  } catch (err) {
    sendError(res, err, 'Failed to list items');
  }
};

// GET /api/spaces/:spaceId/items/:itemId
export const getItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;

    const space = await Space.findOne({
      _id: spaceId,
      $or: [
        { owner: req.user._id },
        { visibility: { $in: ['public', 'unlisted'] } }
      ]
    }).lean();

    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId }).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    res.json({
      item: {
        ...item,
        folderName: folderInfo?.name || 'Workspace',
        folderPath: folderInfo?.path || 'Workspace',
        folderPathArray: folderInfo?.pathArray || ['Workspace']
      }
    });
  } catch (err) {
    sendError(res, err, 'Failed to get item');
  }
};

// POST /api/spaces/:spaceId/items
export const createItem = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const {
      type, folderId, title, content, caption, tags,
      language, codeExample, url, docType, learningType,
      model, repoName, cloudinaryUrl, cloudinaryPublicId,
      format, fileSize, width, height
    } = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: 'Item title is required' });
    }

    const validTypes = ['note', 'doc', 'snippet', 'learning', 'prompt', 'repo', 'image'];
    const finalType = validTypes.includes(type) ? type : 'note';

    // Verify or assign folderId
    let finalFolderId = folderId;
    if (finalFolderId) {
      const folderExists = await Folder.findOne({ _id: finalFolderId, spaceId });
      if (!folderExists) {
        finalFolderId = null;
      }
    }

    // If no valid folder provided, find or create default folder
    if (!finalFolderId) {
      let defaultFolder = await Folder.findOne({ spaceId }).sort({ createdAt: 1 });
      if (!defaultFolder) {
        defaultFolder = await Folder.create({
          owner: req.user._id,
          spaceId,
          name: 'Workspace',
          parentId: null
        });
      }
      finalFolderId = defaultFolder._id;
    }

    const preview = content
      ? content.replace(/[#*`_~[\]()]/g, '').slice(0, 250).trim()
      : (caption || '').slice(0, 250).trim();

    const item = await Item.create({
      owner: req.user._id,
      spaceId,
      folderId: finalFolderId,
      title: trimmedTitle,
      type: finalType,
      content: content || '',
      preview,
      caption: (caption || '').trim(),
      tags: parseTags(tags),
      language: language || 'javascript',
      codeExample: codeExample || null,
      url: (url || '').trim(),
      docType: docType || (finalType === 'image' ? 'image' : 'markdown'),
      learningType: learningType || 'learning',
      model: model || '',
      repoName: repoName || '',
      cloudinaryUrl: cloudinaryUrl || '',
      cloudinaryPublicId: cloudinaryPublicId || '',
      format: format || '',
      fileSize: fileSize || 0,
      width: width || null,
      height: height || null,
    });

    // Update space count
    const countField = `${finalType}sCount`;
    if (space[countField] !== undefined) {
      await updateSpaceResourceCount(spaceId, countField, 1);
    }

    await logUserHistory(
      req.user._id,
      `created_${finalType}`,
      `Created ${finalType} "${item.title}"`,
      { spaceId, itemId: item._id, type: finalType }
    );

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    res.status(201).json({
      item: {
        ...item.toObject(),
        folderName: folderInfo?.name || 'Workspace',
        folderPath: folderInfo?.path || 'Workspace',
        folderPathArray: folderInfo?.pathArray || ['Workspace']
      }
    });
  } catch (err) {
    sendError(res, err, 'Failed to create item');
  }
};

// PATCH /api/spaces/:spaceId/items/:itemId
export const updateItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;
    const updates = req.body;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (updates.title !== undefined) {
      const trimmed = updates.title.trim();
      if (!trimmed) return res.status(400).json({ error: 'Title cannot be empty' });
      item.title = trimmed;
    }

    if (updates.content !== undefined) {
      item.content = updates.content;
      item.preview = updates.content.replace(/[#*`_~[\]()]/g, '').slice(0, 250).trim();
    }

    if (updates.folderId !== undefined) {
      if (updates.folderId) {
        const folderExists = await Folder.findOne({ _id: updates.folderId, spaceId });
        if (folderExists) {
          item.folderId = updates.folderId;
        }
      } else {
        item.folderId = null;
      }
    }

    if (updates.tags !== undefined) {
      item.tags = parseTags(updates.tags);
    }

    if (updates.caption !== undefined) item.caption = updates.caption.trim();
    if (updates.language !== undefined) item.language = updates.language;
    if (updates.codeExample !== undefined) item.codeExample = updates.codeExample;
    if (updates.url !== undefined) item.url = updates.url.trim();
    if (updates.learningType !== undefined) item.learningType = updates.learningType;
    if (updates.docType !== undefined) item.docType = updates.docType;
    if (updates.model !== undefined) item.model = updates.model;
    if (updates.isPinned !== undefined) item.isPinned = !!updates.isPinned;

    await item.save();

    const pathMap = await getFolderPathMap(spaceId);
    const folderInfo = item.folderId ? pathMap.get(item.folderId.toString()) : null;

    if (updates.folderId !== undefined) {
      await logUserHistory(
        req.user._id,
        `moved_${item.type}`,
        `Moved ${item.type} "${item.title}" to ${folderInfo?.name || 'Workspace'}`,
        { spaceId, itemId: item._id, type: item.type }
      );
    } else {
      await logUserHistory(
        req.user._id,
        `updated_${item.type}`,
        `Updated ${item.type} "${item.title}"`,
        { spaceId, itemId: item._id, type: item.type }
      );
    }

    res.json({
      item: {
        ...item.toObject(),
        folderName: folderInfo?.name || 'Workspace',
        folderPath: folderInfo?.path || 'Workspace',
        folderPathArray: folderInfo?.pathArray || ['Workspace']
      }
    });
  } catch (err) {
    sendError(res, err, 'Failed to update item');
  }
};

// PATCH /api/spaces/:spaceId/items/:itemId/pin
export const togglePinItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ isPinned: item.isPinned });
  } catch (err) {
    sendError(res, err, 'Failed to toggle pin');
  }
};

// DELETE /api/spaces/:spaceId/items/:itemId
export const deleteItem = async (req, res) => {
  try {
    const { spaceId, itemId } = req.params;

    const space = await verifySpaceOwnership(spaceId, req.user._id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const item = await Item.findOne({ _id: itemId, spaceId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const itemType = item.type;
    const itemTitle = item.title;

    await Item.deleteOne({ _id: itemId, spaceId });

    // Decrement space count
    const countField = `${itemType}sCount`;
    if (space[countField] !== undefined && space[countField] > 0) {
      await updateSpaceResourceCount(spaceId, countField, -1);
    }

    await logUserHistory(
      req.user._id,
      `deleted_${itemType}`,
      `Deleted ${itemType} "${itemTitle}"`,
      { spaceId }
    );

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Failed to delete item');
  }
};
