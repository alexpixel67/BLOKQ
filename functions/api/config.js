// functions/api/config.js
export async function onRequest(context) {
  // This code runs on Cloudflare's server at runtime.
  // It pulls the variables from your secure Cloudflare Dashboard and bundles them.
  const config = {
    apiKey: context.env.FIREBASE_API_KEY,
    authDomain: context.env.FIREBASE_AUTH_DOMAIN,
    projectId: context.env.FIREBASE_PROJECT_ID,
    storageBucket: context.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: context.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: context.env.FIREBASE_APP_ID
  };

  // It sends the variables dynamically to your browser
  return new Response(JSON.stringify(config), {
    headers: { 'Content-Type': 'application/json' }
  });
}
