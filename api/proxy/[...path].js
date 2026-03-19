// /api/proxy/[...path].js
// Proxy reverso que busca conteúdo do agendazap.top,
// reescreve URLs absolutas para passar pelo proxy,
// e devolve como same-origin.

const TARGET = 'https://agendazap.top';

export default async function handler(req, res) {
  try {
    // Monta o path de destino a partir dos segmentos da URL
    const pathSegments = req.query.path || [];
    let targetPath = '/' + pathSegments.join('/');

    // Preserva a query string original (exceto 'path' que é do Vercel)
    const url = new URL(req.url, `https://${req.headers.host}`);
    const params = new URLSearchParams(url.search);
    params.delete('path');
    const qs = params.toString();
    if (qs) targetPath += '?' + qs;

    const targetUrl = TARGET + targetPath;

    // Headers para simular navegação direta
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'pt-BR,pt;q=0.9',
      'Referer': TARGET + '/',
      'Origin': TARGET,
    };

    // Se for POST, encaminha o body
    const fetchOptions = {
      method: req.method,
      headers,
      redirect: 'follow',
    };

    if (req.method === 'POST') {
      // Lê o body como texto
      const bodyChunks = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk);
      }
      const body = Buffer.concat(bodyChunks).toString();
      fetchOptions.body = body;
      fetchOptions.headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    }

    const response = await fetch(targetUrl, fetchOptions);

    const contentType = response.headers.get('content-type') || '';

    // Copia headers relevantes
    if (response.headers.get('set-cookie')) {
      res.setHeader('Set-Cookie', response.headers.get('set-cookie'));
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    // Se for HTML, reescreve URLs
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Reescreve URLs absolutas do agendazap.top para o proxy
      html = html.replace(/https?:\/\/agendazap\.top/gi, '/api/proxy');

      // Reescreve URLs absolutas que começam com / (sem domínio)
      // mas que não sejam já /api/proxy
      // Usa <base> tag para resolver caminhos relativos
      html = html.replace(
        '<head>',
        '<head><base href="/api/proxy/">'
      );
      // Se não tiver <head>, tenta <html>
      if (!html.includes('<head>')) {
        html = html.replace(
          '<html',
          '<html><head><base href="/api/proxy/"></head><html'
        );
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(response.status).send(html);

    } else if (contentType.includes('text/css')) {
      let css = await response.text();
      // Reescreve URLs dentro do CSS
      css = css.replace(/https?:\/\/agendazap\.top/gi, '/api/proxy');
      res.setHeader('Content-Type', contentType);
      res.status(response.status).send(css);

    } else if (contentType.includes('javascript')) {
      let js = await response.text();
      // Reescreve URLs dentro do JS
      js = js.replace(/https?:\/\/agendazap\.top/gi, '/api/proxy');
      res.setHeader('Content-Type', contentType);
      res.status(response.status).send(js);

    } else {
      // Binário (imagens, fonts, etc): repassa direto
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      const cacheControl = response.headers.get('cache-control');
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);
      res.status(response.status).send(Buffer.from(buffer));
    }

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
