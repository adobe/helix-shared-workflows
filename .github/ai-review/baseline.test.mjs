import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM, answerText, converseBody, createBaseline } from './baseline-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const listen = (server) => new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });

// A stand-in for Bedrock that records what it was asked and answers "<question>, answered".
async function bedrock(t, { status = 200 } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
    response.writeHead(status, { 'content-type': 'application/json' });
    const question = requests.at(-1).body.messages[0].content[0].text;
    response.end(JSON.stringify(status === 200
      ? { output: { message: { content: [{ reasoningContent: { reasoningText: { text: 'thinking' } } }, { text: `${question}, answered` }] } } }
      : { message: 'throttled' }));
  });
  const port = await listen(server);
  t.after(() => server.close());
  return { endpoint: `http://127.0.0.1:${port}`, requests };
}

async function baseline(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'baseline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'questions.jsonl');
  const server = createBaseline({ model: 'global.small.model-1', apiKey: 'key-for-tests', maxQuestions: 2, log, ...options });
  const port = await listen(server);
  t.after(() => server.close());
  const post = (body) => fetch(`http://127.0.0.1:${port}/ask`, { method: 'POST', body });
  return { port, post, log };
}

test('the request has the question and a system prompt, and no tools', () => {
  const body = converseBody('What is 2 + 2?');
  assert.deepEqual(Object.keys(body).sort(), ['inferenceConfig', 'messages', 'system']);
  assert.deepEqual(body.messages, [{ role: 'user', content: [{ text: 'What is 2 + 2?' }] }]);
  assert.equal(body.system[0].text, SYSTEM);
  assert.equal('toolConfig' in body, false);
});

test('the answer is the text of the message, without its reasoning', () => {
  assert.equal(answerText({ output: { message: { content: [{ reasoningContent: {} }, { text: ' four ' }] } } }), 'four');
  assert.equal(answerText({}), '');
});

test('a question goes to the model with the key, and question and answer are logged', async (t) => {
  const { endpoint, requests } = await bedrock(t);
  const { post, log } = await baseline(t, { endpoint });
  const response = await post('How do I pin Node in a workflow?');
  assert.equal(response.status, 200);
  assert.equal((await response.text()).trim(), 'How do I pin Node in a workflow?, answered');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/model/global.small.model-1/converse');
  assert.equal(requests[0].authorization, 'Bearer key-for-tests');
  const entry = JSON.parse(readFileSync(log, 'utf8').trim());
  assert.equal(entry.question, 'How do I pin Node in a workflow?');
  assert.equal(entry.answer, 'How do I pin Node in a workflow?, answered');
  assert.equal(entry.model, 'global.small.model-1');
  assert.doesNotMatch(readFileSync(log, 'utf8'), /key-for-tests/);
});

test('each question is a conversation of its own', async (t) => {
  const { endpoint, requests } = await bedrock(t);
  const { post } = await baseline(t, { endpoint });
  await post('first');
  await post('second');
  assert.deepEqual(requests.map((request) => request.body.messages.length), [1, 1]);
  assert.equal(requests[1].body.messages[0].content[0].text, 'second');
});

test('the questions are capped, and an empty or oversized one is refused without a call', async (t) => {
  const { endpoint, requests } = await bedrock(t);
  const { post } = await baseline(t, { endpoint });
  assert.equal((await post('  ')).status, 400);
  assert.equal((await post('x'.repeat(4001))).status, 413);
  assert.equal(requests.length, 0);
  assert.equal((await post('one')).status, 200);
  assert.equal((await post('two')).status, 200);
  const third = await post('three');
  assert.equal(third.status, 429);
  assert.match(await third.text(), /its 2 questions/);
  assert.equal(requests.length, 2);
});

test('an error from Bedrock is reported, logged and counts as a question', async (t) => {
  const { endpoint } = await bedrock(t, { status: 429 });
  const { post, log } = await baseline(t, { endpoint });
  const response = await post('one');
  assert.equal(response.status, 502);
  assert.match(await response.text(), /Bedrock answered 429/);
  assert.match(JSON.parse(readFileSync(log, 'utf8').trim()).error, /429/);
});

test('only POST /ask and GET /health are served', async (t) => {
  const { endpoint } = await bedrock(t);
  const { port } = await baseline(t, { endpoint });
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/ask`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/other`, { method: 'POST', body: 'x' })).status, 404);
});

test('ask-baseline prints the answer, takes the question from stdin too, and fails when nothing listens', async (t) => {
  const { endpoint } = await bedrock(t);
  const { port } = await baseline(t, { endpoint, maxQuestions: 5 });
  const cli = (args, input) => new Promise((resolve) => {
    // spawnSync would block this process, which also serves the baseline
    import('node:child_process').then(({ spawn }) => {
      const child = spawn(process.execPath, [join(HERE, 'ask-baseline.mjs'), ...args], { env: { ...process.env, BASELINE_PORT: String(port) } });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      if (input === undefined) child.stdin.end(); else child.stdin.end(input);
    });
  });
  assert.deepEqual(await cli(['What', 'is', 'a', 'skill?']), { status: 0, stdout: 'What is a skill?, answered\n', stderr: '' });
  assert.equal((await cli([], 'from stdin\n')).stdout, 'from stdin, answered\n');
  assert.equal((await cli([], '')).status, 2);
  const down = spawnSync(process.execPath, [join(HERE, 'ask-baseline.mjs'), 'question'], { encoding: 'utf8', env: { ...process.env, BASELINE_PORT: '1' } });
  assert.equal(down.status, 1);
  assert.match(down.stderr, /not running/);
});
