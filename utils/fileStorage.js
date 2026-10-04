import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import cloudinary from '../config/cloudinary.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Ensures the target directory exists
 */
function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Saves a file buffer locally
 */
export async function saveFileLocally(buffer, originalFilename, subfolder = 'documents') {
  try {
    const targetDir = path.join(UPLOADS_DIR, subfolder);
    ensureDirExists(targetDir);

    const sanitizedName = (originalFilename || 'document')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\s+/g, '_');
    
    const uniqueFilename = `${Date.now()}-${sanitizedName}`;
    const absolutePath = path.join(targetDir, uniqueFilename);
    const relativePath = path.join('uploads', subfolder, uniqueFilename).replace(/\\/g, '/');

    await fs.promises.writeFile(absolutePath, buffer);
    return { absolutePath, relativePath, filename: uniqueFilename };
  } catch (err) {
    console.error('[FileStorage Error] Failed to save locally:', err);
    return null;
  }
}

/**
 * Downloads a raw asset securely from Cloudinary using the Admin signed archive API and caches it locally
 */
export async function fetchAndCacheCloudinaryRawAsset(publicId, fallbackFilename = 'document.pdf') {
  if (!publicId) return null;
  try {
    const archiveUrl = cloudinary.utils.download_zip_url({
      public_ids: [publicId],
      resource_type: 'raw',
    });

    const response = await axios.get(archiveUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const zip = new AdmZip(Buffer.from(response.data));
    const entries = zip.getEntries();
    if (!entries || entries.length === 0) return null;

    const fileEntry = entries.find(e => !e.isDirectory) || entries[0];
    const fileBuffer = fileEntry.getData();

    const saveResult = await saveFileLocally(fileBuffer, fallbackFilename, 'documents');
    return saveResult;
  } catch (err) {
    console.warn('[FileStorage] Failed to cache Cloudinary asset via archive API:', err.message);
    return null;
  }
}

/**
 * Deletes a local file safely
 */
export async function deleteLocalFile(relativePathOrAbsolute) {
  if (!relativePathOrAbsolute) return;
  try {
    const absolutePath = path.isAbsolute(relativePathOrAbsolute)
      ? relativePathOrAbsolute
      : path.join(process.cwd(), relativePathOrAbsolute);

    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
    }
  } catch (err) {
    console.warn('[FileStorage Error] Failed to delete local file:', err.message);
  }
}

/**
 * Checks if local file exists and returns absolute path
 */
export function getLocalFilePath(relativePathOrAbsolute) {
  if (!relativePathOrAbsolute) return null;
  const absolutePath = path.isAbsolute(relativePathOrAbsolute)
    ? relativePathOrAbsolute
    : path.join(process.cwd(), relativePathOrAbsolute);

  return fs.existsSync(absolutePath) ? absolutePath : null;
}
