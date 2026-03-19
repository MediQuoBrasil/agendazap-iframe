const TARGET = 'https://agendazap.top';
const PREFIX = '/api/proxy';

/**
 * Reescreve todas as URLs absolutas do agendazap para o proxy
 */
function rewriteAbsoluteUrls(text) {
  return text.replace(/https?:\/\/(www\.)?agendazap\.top/gi, PREFIX);
}

/**
 * Reescreve paths dentro de HTML
 */
function rewriteHtml(html) {
  html = rewriteAbsoluteUrls(html);

  // Atributos HTML: src, href, action, poster, data-*
  html = html.replace(/(src|href|action|poster|data-[a-z\-]+)=(["'])\/(?!\/|api\/proxy)/gi,
    '$1=$2' + PREFIX + '/');

  // Strings JS inline dentro do HTML: "/path..." e '/path...'
  // Captura aspas + / + letra (evita "/", "//", e paths ja reescritos)
  html = html.replace(/(["'])\/(?!\/|api\/proxy)([a-zA-Z])/g,
    '$1' + PREFIX + '/$2');

  return html;
}

/**
 * Reescreve paths dentro de CSS
 */
function rewriteCss(css) {
  css = rewriteAbsoluteUrls(css);
  css = css.replace(/url\(\s*(["']?)\/(?!\/|api\/proxy)/g,
    'url($1' + PREFIX + '/');
  return css;
}

/**
 * Reescreve paths dentro de JS
 */
function rewriteJs(js) {
  js = rewriteAbsoluteUrls(js);

  // Strings literais com paths absolutos: "/assets/...", '/p/...', etc
  // Negative lookahead evita "//..." e paths ja com prefixo
  js = js.replace(/(["'])\/(?!\/|api\/proxy)([a-zA-Z])/g,
    '$1' + PREFIX + '/$2');

  return js;
}

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
    var rawUrl = req.url || '';
    var targetPath = rawUrl;

    if (rawUrl.startsWith(PREFIX)) {
      targetPath = rawUrl.substring(PREFIX.length);
    }

    if (!targetPath || targetPath === '/') {
      return res.status(200).json({ ok: true, message: 'Proxy funcionando!' });
    }

    targetUrl = TARGET + targetPath;

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
    // Impede cache para facilitar debug - remover depois
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (contentType.includes('text/html')) {
      var html = await response.text();
      html = rewriteHtml(html);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(response.status).send(html);

    } else if (contentType.includes('css')) {
      var css = await response.text();
      css = rewriteCss(css);
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(css);

    } else if (
      contentType.includes('javascript') ||
      contentType.includes('text/js') ||
      contentType.includes('ecmascript')
    ) {
      var js = await response.text();
      js = rewriteJs(js);
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
    return res.status(500).json({
      error: 'Proxy error',
      message: err.message,
      url: targetUrl || 'unknown'
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
