const TARGET = 'https://agendazap.top';

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  var targetUrl = '';

  try {
    // Extrai o caminho REAL da URL original (apos /api/proxy)
    var prefix = '/api/proxy';
    var rawUrl = req.url || '';
    var targetPath = rawUrl;

    // Remove o prefixo /api/proxy
    if (rawUrl.startsWith(prefix)) {
      targetPath = rawUrl.substring(prefix.length);
    }

    // Se nao sobrou path, retorna info
    if (!targetPath || targetPath === '/') {
      return res.status(200).json({ ok: true, message: 'Proxy funcionando!', hint: 'Adicione um caminho apos /api/proxy/' });
    }

    targetUrl = TARGET + targetPath;

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
      // Reescreve URLs absolutas do agendazap para passar pelo proxy
      html = html.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      // Reescreve caminhos absolutos em atributos src, href, action
      // Negative lookahead evita duplicar o prefixo em URLs ja reescritas
      html = html.replace(/(src|href|action)=(["'])\/(?!api\/proxy)/g, '$1=$2/api/proxy/');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(response.status).send(html);

    } else if (contentType.includes('css')) {
      var css = await response.text();
      css = css.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      css = css.replace(/url\(\s*(["']?)\/(?!api\/proxy)/g, 'url($1/api/proxy/');
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
