// functions/api/config.js
export async function onRequest(context) {
  // This now matches the exact lowercase names you used in Cloudflare
  const config = {
    apiKey: context.env.apiKey,
    authDomain: context.env.authDomain,
    projectId: context.env.projectId,
    storageBucket: context.env.storageBucket,
    messagingSenderId: context.env.messagingSenderId,
    appId: context.env.appId,
    measurementId: context.env.measurementId
  };

  return new Response(JSON.stringify(config), {
    headers: { 'Content-Type': 'application/json' }
  });
}
