// /api/proxy/[...path].js
// Reverse proxy para agendazap.top

const TARGET = 'https://agendazap.top';

module.exports = async function handler(req, res) {
  try {
    // Captura os segmentos do path
    const pathSegments = req.query.path;
    if (!pathSegments || pathSegments.length === 0) {
      return res.status(400).json({ error: 'Path obrigatório' });
    }

    // Reconstroi o path original
    let targetPath = '/' + pathSegments.join('/');

    // Reconstroi query string (removendo 'path' que é interno do Vercel)
    const queryEntries = Object.entries(req.query).filter(([k]) => k !== 'path');
    if (queryEntries.length > 0) {
      targetPath += '?' + queryEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }

    const targetUrl = TARGET + targetPath;
    console.log('[PROXY]', req.method, targetUrl);

    // Headers simulando navegação direta no agendazap.top
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': TARGET + '/',
      'Origin': TARGET,
    };

    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'follow',
    };

    // Encaminha body para POST
    if (req.method === 'POST') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', resolve);
        req.on('error', reject);
      });
      fetchOptions.body = Buffer.concat(chunks);
      headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    // Headers de resposta
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Processa conforme tipo de conteúdo
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Reescreve URLs absolutas do agendazap.top
      html = html.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');

      // Reescreve caminhos absolutos tipo src="/vendor/..." ou href="/assets/..."
      html = html.replace(/(src|href|action)=(["'])\//g, '$1=$2/api/proxy/');

      // Reescreve URLs em atributos com caminho relativo
      // Não precisa <base> pois reescrevemos diretamente

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(response.status).send(html);

    } else if (contentType.includes('css')) {
      let css = await response.text();
      css = css.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      // Reescreve url() no CSS com caminhos absolutos
      css = css.replace(/url\(\s*(["']?)\//g, 'url($1/api/proxy/');
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(css);

    } else if (contentType.includes('javascript') || contentType.includes('text/js')) {
      let js = await response.text();
      js = js.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(js);

    } else {
      // Binário (imagens, fonts, etc)
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      const cc = response.headers.get('cache-control');
      if (cc) res.setHeader('Cache-Control', cc);
      return res.status(response.status).send(buffer);
    }

  } catch (err) {
    console.error('[PROXY ERROR]', err);
    return res.status(500).json({ error: 'Proxy error', message: err.message });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
