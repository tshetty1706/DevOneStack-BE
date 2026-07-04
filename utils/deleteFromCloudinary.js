import cloudinary from '../config/cloudinary.js';

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    invalidate: true,
  });
};

export default deleteFromCloudinary;
