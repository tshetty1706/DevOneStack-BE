import cloudinary from '../config/cloudinary.js';

const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const isPdf = options.resource_type === 'raw';
    const uploadType = options.type || 'authenticated';
    const accessMode = options.access_mode || (uploadType === 'upload' ? 'public' : 'authenticated');

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:        options.folder || 'devonestack/uploads',
        resource_type: options.resource_type || 'image',
        type:          uploadType,
        access_mode:   accessMode,
        // For PDFs: add fl_attachment:false so browser opens inline
        ...(isPdf && { flags: 'attachment:false' }),
        ...options,
      },
      (error, result) => error ? reject(error) : resolve(result)
    );
    uploadStream.end(buffer);
  });
};

export default uploadToCloudinary;
