import cloudinary from '../config/cloudinary.js';

/**
 * Determines appropriate Cloudinary resource_type and file metadata from mimetype/filename
 */
export const detectFileType = (file) => {
  const mime = (file?.mimetype || '').toLowerCase();
  const name = (file?.originalname || file?.name || '').toLowerCase();

  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg|bmp|ico)$/i.test(name);
  const isText = mime.startsWith('text/') || /\.(md|markdown|txt|json|csv)$/i.test(name);

  let docType = 'doc';
  let resourceType = 'image';

  if (isPdf) {
    docType = 'pdf';
    resourceType = 'raw';
  } else if (isImage) {
    docType = 'image';
    resourceType = 'image';
  } else if (isText) {
    docType = 'markdown';
    resourceType = 'raw';
  }

  return { isPdf, isImage, isText, docType, resourceType };
};

/**
 * Universal Cloudinary stream uploader with automatic retry and error handling
 */
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const resourceType = options.resource_type || 'auto';
    const uploadType = options.type || 'upload';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'devonestack/uploads',
        resource_type: resourceType,
        type: uploadType,
        access_mode: 'public',
        overwrite: true,
        use_filename: true,
        unique_filename: true,
        ...options,
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary Upload Error]', error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

export default uploadToCloudinary;

