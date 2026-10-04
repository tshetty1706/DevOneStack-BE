import cloudinary from '../config/cloudinary.js';

const deleteFromCloudinary = async (publicId, resourceType = 'image', options = {}) => {
  const type = options.type || 'upload';
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type,
    invalidate: true,
    ...options,
  });
};

export default deleteFromCloudinary;

