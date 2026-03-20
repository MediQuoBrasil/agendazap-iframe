var TARGET = 'https://agendazap.top';

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    return res.status(200).end();
  }

  var targetUrl = '';

  try {
    var pathSegments = req.query.path;
    if (!pathSegments || pathSegments.length === 0) {
      return res.status(400).json({ error: 'Path obrigatorio' });
    }

    // Handle both array and string path formats
    if (typeof pathSegments === 'string') {
      pathSegments = pathSegments.split('/');
    }

    var basePath = '/' + pathSegments.join('/');

    // Separate query params (excluding Vercel's internal 'path')
    var queryParts = [];
    var serviceValue = '';
    var keys = Object.keys(req.query);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'path') continue;
      if (k === 'service') {
        serviceValue = req.query[k];
      }
      queryParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(req.query[k]));
    }

    // FIX #1: agendazap expects /p/mediquo&service=767 (& in path, NOT query string)
    // Only for the booking page path /p/..., use & format
    if (pathSegments[0] === 'p' && serviceValue) {
      targetUrl = TARGET + basePath + '&service=' + encodeURIComponent(serviceValue);
      // Remove service from remaining query parts
      queryParts = queryParts.filter(function(part) {
        return !part.startsWith('service=');
      });
      if (queryParts.length > 0) {
        targetUrl += '?' + queryParts.join('&');
      }
    } else {
      // Standard query string for all other paths (API calls, assets, etc)
      if (queryParts.length > 0) {
        targetUrl = TARGET + basePath + '?' + queryParts.join('&');
      } else {
        targetUrl = TARGET + basePath;
      }
    }

    // Headers simulando navegacao direta
    var headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': TARGET + '/',
      'Origin': TARGET
    };

    // Forward X-Requested-With (jQuery AJAX sends XMLHttpRequest)
    if (req.headers['x-requested-with']) {
      headers['X-Requested-With'] = req.headers['x-requested-with'];
    }

    // Forward cookies if present
    if (req.headers['cookie']) {
      headers['Cookie'] = req.headers['cookie'];
    }

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

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

    // Forward Set-Cookie headers with domain stripped
    // agendazap sends domain=.agendazap.top which the browser rejects
    // because current domain is agendazap-iframe.vercel.app
    var rawHeaders = response.headers;
    var setCookies = [];
    if (rawHeaders.getSetCookie) {
      setCookies = rawHeaders.getSetCookie();
    } else if (rawHeaders.raw && rawHeaders.raw()['set-cookie']) {
      setCookies = rawHeaders.raw()['set-cookie'];
    }
    if (setCookies && setCookies.length > 0) {
      var rewrittenCookies = setCookies.map(function(cookie) {
        // Remove domain=... attribute so cookie applies to proxy domain
        cookie = cookie.replace(/;\s*domain=[^;]*/gi, '');
        // Ensure path=/ so cookies are sent for all /api/proxy/ requests
        cookie = cookie.replace(/;\s*path=[^;]*/gi, '; path=/');
        // Remove SameSite=None which requires Secure in cross-origin contexts
        // but our iframe is same-origin so Lax is fine
        cookie = cookie.replace(/;\s*samesite=[^;]*/gi, '; SameSite=Lax');
        return cookie;
      });
      res.setHeader('Set-Cookie', rewrittenCookies);
    }

    if (contentType.includes('text/html')) {
      var html = await response.text();

      // FIX #2: Rewrite JSON-escaped URLs in inline scripts
      // GlobalVariables.baseUrl uses "https:\/\/agendazap.top" (escaped slashes)
      // The old regex only matched unescaped https://agendazap.top
      html = html.replace(/https?:\\\/\\\/(www\.)?agendazap\.top/gi, '\\/api\\/proxy');

      // Rewrite normal unescaped absolute URLs
      html = html.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');

      // Rewrite root-relative paths in src, href, action attributes
      // Negative lookahead prevents doubling /api/proxy/ on already-rewritten URLs
      html = html.replace(/(src|href|action)=(["'])\/(?!api\/proxy)/g, '$1=$2/api/proxy/');

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
      // Handle both escaped and unescaped URLs in JS files
      js = js.replace(/https?:\\\/\\\/(www\.)?agendazap\.top/gi, '\\/api\\/proxy');
      js = js.replace(/https?:\/\/(www\.)?agendazap\.top/gi, '/api/proxy');
      // FIX: Rewrite root-relative /assets/ paths in JS string literals
      // e.g. utilsScript: '/assets/js/tel_input/utils.js' -> '/api/proxy/assets/...'
      // Do NOT rewrite /index.php/ paths - they use GlobalVariables.baseUrl + prefix already
      js = js.replace(/(['"])\/assets\//g, '$1/api/proxy/assets/');
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
