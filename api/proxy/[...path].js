const TARGET = 'https://agendazap.top';

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  try {
    const pathSegments = req.query.path;
    if (!pathSegments || pathSegments.length === 0) {
      return res.status(400).json({ error: 'Path obrigatorio' });
    }

    let targetPath = '/' + pathSegments.join('/');

    // Reconstroi query string (remove 'path' interno do Vercel)
    const qs = Object.entries(req.query)
      .filter(function(e) { return e[0] !== 'path'; })
      .map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
      .join('&');
    if (qs) targetPath += '?' + qs;

    var targetUrl = TARGET + targetPath;

    // Headers simulando navegacao direta
    var headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': TARGET + '/',
      'Origin': TARGET
    };

    var fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'follow'
    };

    // Encaminha body para POST
    if (req.method === 'POST') {
      var chunks = [];
      await new Promise(function(resolve, reject) {
        req.on('data', function(chunk) { chunks.push(chunk); });
        req.on('end', resolve);
        req.on('error', reject);
      });
      fetchOptions.body = Buffer.concat(chunks);
      headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    }

    var response = await fetch(targetUrl, fetchOptions);
    var contentType = response.headers.get('content-type') || '';

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentType.includes('text/html')) {
      var html = await response.text();
      // Reescreve URLs absolutas
      html = html.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      // Reescreve caminhos absolutos em atributos src, href, action
      html = html.replace(/(src|href|action)=(["'])\//g, '$1=$2/api/proxy/');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(response.status).send(html);

    } else if (contentType.includes('css')) {
      var css = await response.text();
      css = css.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      css = css.replace(/url\(\s*(["']?)\//g, 'url($1/api/proxy/');
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(css);

    } else if (contentType.includes('javascript') || contentType.includes('text/js')) {
      var js = await response.text();
      js = js.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(js);

    } else {
      var buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      var cc = response.headers.get('cache-control');
      if (cc) res.setHeader('Cache-Control', cc);
      return res.status(response.status).send(buffer);
    }

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', message: err.message, url: targetUrl || 'unknown' });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
