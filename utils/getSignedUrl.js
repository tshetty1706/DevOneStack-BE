import cloudinary from '../config/cloudinary.js';

const getSignedUrl = (publicId, resourceType = 'image', expiresInSeconds = 3600) => {
  const options = {
    sign_url:      true,
    type:          'authenticated',
    expires_at:    Math.floor(Date.now() / 1000) + expiresInSeconds,
    resource_type: resourceType,
    secure:        true,
  };

  // For PDFs: force inline display — prevent forced download
  if (resourceType === 'raw') {
    options.flags = 'attachment:false';
    options.attachment = false;
  }

  return cloudinary.url(publicId, options);
};

export default getSignedUrl;
