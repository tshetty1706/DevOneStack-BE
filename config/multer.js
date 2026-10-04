import multer from 'multer';

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/jpg',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'applications/vnd.pdf',
  'text/pdf',
]);

const allowedExtensions = /\.(jpe?g|png|webp|gif|svg|bmp|ico|pdf)$/i;

const fileFilter = (req, file, cb) => {
  const isAllowedMime = allowedMimeTypes.has(file.mimetype?.toLowerCase());
  const isAllowedExt = allowedExtensions.test(file.originalname || '');

  if (isAllowedMime || isAllowedExt) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPEG/PNG/WEBP/GIF/SVG) and PDF documents are allowed'), false);
  }
};

export default multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB hard limit
});

