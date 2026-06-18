// functions/[[path]].ts - Cloudflare Workers router
// Routes requests to appropriate API handlers

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Set environment variables for handlers
  context.env = env;

  try {
    // Route API requests
    if (path === '/api/wager' && request.method === 'POST') {
      const { onRequestPost } = await import('./api/wager.js');
      return onRequestPost(context);
    }
    
    if (path === '/api/admin' && request.method === 'POST') {
      const { onRequestPost } = await import('./api/admin.js');
      return onRequestPost(context);
    }
    
    if (path === '/api/config' && request.method === 'GET') {
      const { onRequest } = await import('./api/config.js');
      return onRequest(context);
    }

    // Serve static files for non-API routes
    // In production, configure Cloudflare Pages to serve static assets
    return new Response('Not Found', { status: 404 });
    
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
