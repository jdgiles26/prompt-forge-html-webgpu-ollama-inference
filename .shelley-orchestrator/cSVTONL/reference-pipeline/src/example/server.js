/**
 * src/example/server.js
 * Minimal, zero-dependency HTTP server implementing the login flow that
 * tests/e2e/example/login.spec.js exercises. Built with Node's built-in
 * `http` module only — no Express, no bundler — consistent with this
 * scaffold's zero-external-dependency philosophy for anything that isn't a
 * real browser (Playwright) or the language runtime itself.
 *
 * Run directly: `node src/example/server.js` (listens on :4173, matching
 * playwright.config.js's webServer block), or let `npx playwright test`
 * boot it automatically via that same config.
 */
const http = require('http');
const { login, AuthError } = require('./login.js');

const PORT = process.env.PORT || 4173;

const LOGIN_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in</title></head>
<body>
  <main>
    <h1>Sign in</h1>
    <div>
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" />
    </div>
    <div>
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" />
    </div>
    <button id="signin" type="button" disabled>Sign in</button>
    <div id="status" role="status" aria-label="Loading" hidden>Loading…</div>
    <div id="error" role="alert" hidden></div>
  </main>
  <script>
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const button = document.getElementById('signin');
    const status = document.getElementById('status');
    const error = document.getElementById('error');

    function refreshButtonState() {
      button.disabled = !(email.value.trim() && password.value.trim());
    }
    email.addEventListener('input', refreshButtonState);
    password.addEventListener('input', refreshButtonState);

    button.addEventListener('click', async () => {
      error.hidden = true;
      status.hidden = false;
      button.disabled = true;
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value, password: password.value }),
        });
        if (res.ok) {
          window.location.href = '/dashboard';
          return;
        }
        const body = await res.json().catch(() => ({}));
        status.hidden = true;
        error.textContent = body.error || 'Invalid email or password';
        error.hidden = false;
        button.disabled = false;
      } catch (e) {
        status.hidden = true;
        error.textContent = 'Invalid email or password';
        error.hidden = false;
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;

const DASHBOARD_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dashboard</title></head>
<body><main><h1>Dashboard</h1><p>You are signed in.</p></main></body>
</html>`;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/login') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(LOGIN_PAGE);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DASHBOARD_PAGE);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const body = await readJsonBody(req);
      const result = await login(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (err instanceof AuthError) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(302, { Location: '/login' });
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Example app listening on http://localhost:${PORT}`);
  });
}

module.exports = server;
