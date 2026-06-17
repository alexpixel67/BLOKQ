// functions/api/config.js
export async function onRequest(context) {
  const config = {
    apiKey: context.env.apiKey,
    authDomain: context.env.authDomain,
    projectId: context.env.projectId,
    storageBucket: context.env.storageBucket,
    messagingSenderId: context.env.messagingSenderId,
    appId: context.env.appId,
    measurementId: context.env.measurementId,
    
    // Add Cloudinary details here
    cloudinaryCloudName: context.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryUploadPreset: context.env.CLOUDINARY_UPLOAD_PRESET
  };

  return new Response(JSON.stringify(config), {
    headers: { 'Content-Type': 'application/json' }
  });
}
