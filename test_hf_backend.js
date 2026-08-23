// Headless regression tests for the Hugging Face cloud backend.
//
// These deliberately need NO network and NO WebGPU: the page loads over
// file://, window.hfGenerate is exercised with a stubbed window.fetch, and we
// assert the request shape + response parsing directly. This is the layer that
// silently broke when HF retired the legacy serverless endpoint
// (api-inference.huggingface.co/models/{id}) in favour of the Inference
// Providers router (OpenAI-compatible /v1/chat/completions).

const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'prompt-forge.html');

let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else    { failed++; failures.push({ name, detail }); console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext().then(c => c.newPage());
  await page.goto(FILE);
  // hfGenerate is exposed on window for exactly this test.
  await page.waitForFunction(() => typeof window.hfGenerate === 'function');

  console.log('\n── HF backend: request shape + parsing ──');

  // 1) Streaming happy path: token set, router endpoint, OpenAI SSE parsed.
  const stream = await page.evaluate(async () => {
    try { localStorage.setItem('pf.hf.key.v1', 'hf_TESTTOKEN'); localStorage.removeItem('pf.hf.url.v1'); } catch {}
    const captured = {};
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo!"}}]}',
      'data: [DONE]',
    ].join('\n\n') + '\n';
    window.fetch = async (url, opts) => {
      captured.url = url; captured.opts = opts;
      const body = new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); },
      });
      return { ok: true, body, status: 200 };
    };
    let out = '';
    const text = await window.hfGenerate({
      model: 'Qwen/Qwen2.5-7B-Instruct', system: 'SYS', prompt: 'hi',
      temperature: 0.3, maxTokens: 128, topP: 0.8,
      onChunk: (c) => { out += c; },
    });
    const parsedBody = JSON.parse(captured.opts.body);
    return {
      url: captured.url,
      auth: captured.opts.headers.Authorization,
      hasMessages: Array.isArray(parsedBody.messages),
      messages: parsedBody.messages,
      lastMsg: parsedBody.messages[parsedBody.messages.length - 1],
      maxTokens: parsedBody.max_tokens,
      stream: parsedBody.stream,
      streamedOut: out,
      returned: text,
    };
  });
  record('posts to the Inference Providers router /v1/chat/completions',
    /\/v1\/chat\/completions$/.test(stream.url), stream.url);
  record('does NOT use the retired api-inference.huggingface.co/models/ route',
    !/api-inference\.huggingface\.co|\/models\//.test(stream.url), stream.url);
  record('sends Bearer token', stream.auth === 'Bearer hf_TESTTOKEN', stream.auth);
  // The Context Shield sanitizes and folds the system prompt into the user
  // message before send, so we assert the chat-format invariants that hold
  // regardless: an OpenAI `messages` array whose final message is a user turn
  // carrying both the system and user text.
  record('builds an OpenAI chat messages array (user turn carries the prompt)',
    stream.hasMessages && stream.lastMsg && stream.lastMsg.role === 'user'
      && /SYS/.test(stream.lastMsg.content) && /hi/.test(stream.lastMsg.content),
    JSON.stringify(stream.messages));
  record('uses chat param max_tokens (not legacy max_new_tokens)', stream.maxTokens === 128, String(stream.maxTokens));
  record('requests streaming', stream.stream === true, String(stream.stream));
  record('parses choices[].delta.content into streamed output', stream.streamedOut === 'Hello!' && stream.returned === 'Hello!', stream.streamedOut);

  // 2) Non-streaming fallback: streaming response not ok -> parse message.content.
  console.log('\n── HF backend: non-streaming fallback ──');
  const fallback = await page.evaluate(async () => {
    try { localStorage.setItem('pf.hf.key.v1', 'hf_TESTTOKEN'); } catch {}
    let call = 0;
    window.fetch = async (url, opts) => {
      call++;
      if (call === 1) return { ok: false, status: 503, body: null, statusText: 'unavailable' };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'FALLBACK-OK' } }] }) };
    };
    let out = '';
    const text = await window.hfGenerate({ model: 'm', prompt: 'x', onChunk: c => { out += c; } });
    return { out, text, calls: call };
  });
  record('falls back to a non-streaming completion on stream failure', fallback.calls === 2, 'calls=' + fallback.calls);
  record('parses choices[].message.content on the fallback path', fallback.text === 'FALLBACK-OK' && fallback.out === 'FALLBACK-OK', fallback.text);

  // 3) Keyless path fails loudly BEFORE any network call.
  console.log('\n── HF backend: keyless guard ──');
  const keyless = await page.evaluate(async () => {
    try { localStorage.removeItem('pf.hf.key.v1'); } catch {}
    let fetched = false;
    window.fetch = async () => { fetched = true; return { ok: true, body: null }; };
    try {
      await window.hfGenerate({ model: 'm', prompt: 'x' });
      return { threw: false, fetched };
    } catch (e) {
      return { threw: true, fetched, msg: e.message };
    }
  });
  record('keyless generation throws an actionable token error', keyless.threw && /access token/i.test(keyless.msg), keyless.msg);
  record('keyless generation makes no network request', keyless.fetched === false, 'fetched=' + keyless.fetched);

  // 4) Recommended list is text-generation only + gated split.
  console.log('\n── HF recommended-model curation ──');
  const lists = await page.evaluate(() => ({
    rec: window.__HF_RECOMMENDED || [],
    gated: window.__HF_RECOMMENDED_GATED || [],
    routerDefault: window.HF_ROUTER_DEFAULT,
  }));
  const multimodal = ['Qwen/Qwen3.5-9B', 'Qwen/Qwen3.5-4B', 'meta-llama/Llama-4-Scout-17B-16E-Instruct', 'google/gemma-3-27b-it'];
  record('recommended list excludes known multimodal (non-text-gen) IDs',
    multimodal.every(m => !lists.rec.includes(m)), lists.rec.filter(x => multimodal.includes(x)).join(',') || 'none');
  record('recommended list is non-empty and includes a verified text-gen model',
    lists.rec.includes('Qwen/Qwen2.5-7B-Instruct'), JSON.stringify(lists.rec.slice(0, 3)));
  record('gated models are separated into their own list',
    lists.gated.includes('meta-llama/Llama-3.1-8B-Instruct') && !lists.rec.includes('meta-llama/Llama-3.1-8B-Instruct'),
    JSON.stringify(lists.gated));
  record('default inference base is the HF router', lists.routerDefault === 'https://router.huggingface.co', lists.routerDefault);

  // 5) Source-level regression: the retired endpoint literal is gone from the
  // app (read from disk in Node — the page's window.fetch is stubbed above).
  console.log('\n── HF source regression ──');
  const src = require('fs').readFileSync(path.resolve(__dirname, 'prompt-forge.html'), 'utf8');
  const hasLegacyPost = /'\/models\/'\s*\+\s*model/.test(src);
  record('source no longer contains the legacy /models/{id} inference POST', hasLegacyPost === false, 'present=' + hasLegacyPost);
  const hasRouter = /\/v1\/chat\/completions/.test(src);
  record('source uses the router /v1/chat/completions endpoint', hasRouter === true, 'present=' + hasRouter);

  console.log('\n══════════════════════════════════════');
  console.log(`HF BACKEND: ${passed} passed · ${failed} failed`);
  await browser.close();
  if (failed) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
