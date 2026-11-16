import http from 'node:http';
import worker from '../dist/server/index.mjs';
const port = Number(process.env.PORT || 3000);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:' + port);
    if (url.pathname === '/eloguessr') { res.writeHead(308, {Location:'/eloguessr/'}); return res.end(); }
    if (url.pathname.startsWith('/eloguessr/')) url.pathname = url.pathname.slice('/eloguessr'.length);
    const request = new Request(url, {method:req.method});
    const result = await worker.fetch(request, {GOOGLE_MAPS_API_KEY:process.env.GOOGLE_MAPS_API_KEY || ''});
    res.writeHead(result.status, Object.fromEntries(result.headers));
    if (req.method === 'HEAD') return res.end();
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch (_) { res.writeHead(500, {'Content-Type':'text/plain'}); res.end('Erro interno'); }
});
server.listen(port, '0.0.0.0', () => console.log('Eloguessr pronto na porta ' + port));
