const TARGET = 'https://agendazap.top';
const PREFIX = '/api/proxy';

/**
 * Reescreve todas as URLs absolutas do agendazap para o proxy.
 * Trata AMBAS as formas:
 *   - Normal:       https://agendazap.top
 *   - JSON-escaped: https:\/\/agendazap.top  (barras escapadas em JS/JSON inline)
 */
function rewriteAbsoluteUrls(text) {
  text = text.replace(/https?:\/\/(www\.)?agendazap\.top/gi, PREFIX);
  text = text.replace(/https?:\\\/\\\/(www\.)?agendazap\.top/gi, PREFIX);
  return text;
}

/**
 * Reescreve paths dentro de HTML
 */
function rewriteHtml(html) {
  html = rewriteAbsoluteUrls(html);
  html = html.replace(/(src|href|action|poster|data-[a-z\-]+)=(["'])\/(?!\/|api\/proxy)/gi,
    '$1=$2' + PREFIX + '/');
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
  js = js.replace(/(["'])\/(?!\/|api\/proxy)([a-zA-Z])/g,
    '$1' + PREFIX + '/$2');
  return js;
}

/**
 * Reconstroi o caminho de destino a partir de req.query,
 * pois o Vercel rewrite coloca os segmentos capturados em req.query.path
 * e os query params originais em req.query.
 */
function buildTargetPath(req) {
  // O Vercel rewrite "/:path*" coloca o match em req.query.path
  var pathSegments = req.query.path;
  var subPath = '';

  if (Array.isArray(pathSegments)) {
    subPath = pathSegments.join('/');
  } else if (typeof pathSegments === 'string' && pathSegments) {
    subPath = pathSegments;
  }

  // Reconstroi query string SEM o 'path' (que e do rewrite interno)
  var qsParts = [];
  var query = req.query || {};
  var keys = Object.keys(query);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'path') continue; // param interno do rewrite
    var v = query[k];
    if (Array.isArray(v)) {
      for (var j = 0; j < v.length; j++) {
        qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v[j]));
      }
    } else {
      qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
  }

  var targetPath = '/' + subPath;
  if (qsParts.length > 0) {
    targetPath += '?' + qsParts.join('&');
  }

  return targetPath;
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
    var targetPath = buildTargetPath(req);

    // Se nao sobrou path, retorna info
    if (targetPath === '/') {
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
