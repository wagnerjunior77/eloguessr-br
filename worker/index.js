// Site assets are inserted at build time; runtime configuration stays in Sites.
const assets = __ELOGUESSR_ASSETS__;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    if (url.pathname === '/config.js') {
      const value = typeof env.GOOGLE_MAPS_API_KEY === 'string' ? env.GOOGLE_MAPS_API_KEY : '';
      // Keep values safe in a JavaScript context even if configuration changes later.
      const json = JSON.stringify({ googleMapsApiKey: value }).replace(/</g, '\\u003c');
      return new Response(request.method === 'HEAD' ? null : `window.ELOGUESSR_CONFIG = ${json};\n`, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
      });
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const asset = Object.hasOwn(assets, pathname) ? assets[pathname] : null;
    if (!asset) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }
    });
  }
};
