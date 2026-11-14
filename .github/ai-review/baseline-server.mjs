// reviewer: the baseline model a reviewer can ask. A small model on Bedrock with nothing
// but the question: no tools, no files, no web, no memory of earlier questions. A reviewer
// of instructions written for agents (skills, prompts, AGENTS.md) uses it to find out what
// a model does without being told; what the baseline gets right by itself, the
// instructions don't need to say.
//
// Listens on 127.0.0.1 only. POST /ask with the question as the body answers with the
// model's text; GET /health answers ok. The Bedrock key stays in this process. Anything on
// the runner can ask, so the number of questions and their size are capped.
//
// Environment: AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, BASELINE_MODEL, BASELINE_PORT,
// BASELINE_MAX_QUESTIONS, BASELINE_LOG (a JSON Lines file of questions and answers).
// BASELINE_ENDPOINT replaces the Bedrock endpoint, for the tests.
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

export const SYSTEM = 'Answer from what you know. You have no tools, no files and no web access, and you can\'t ask back. Say what you would do or what you believe is true, briefly and concretely. If you don\'t know, say so.';
const MAX_QUESTION = 4000;
// Room for a small model that reasons before it answers: the limit covers both.
const MAX_TOKENS = 4000;

// The Converse request for one question. It has no toolConfig: the model can only answer.
export function converseBody(question) {
  return {
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: [{ text: question }] }],
    inferenceConfig: { maxTokens: MAX_TOKENS },
  };
}

// The text of a Converse answer, without reasoning blocks.
export function answerText(data) {
  return (data?.output?.message?.content ?? []).map((block) => block.text ?? '').join('').trim();
}

export async function ask(question, { endpoint, model, apiKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${endpoint}/model/${encodeURIComponent(model)}/converse`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(converseBody(question)),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Bedrock answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const text = answerText(data);
  if (!text) {
    throw new Error(`the model answered without text (stop reason: ${data.stopReason ?? 'unknown'}, output tokens: ${data.usage?.outputTokens ?? 'unknown'})`);
  }
  return text;
}

export function createBaseline({ endpoint, model, apiKey, maxQuestions, log, fetchImpl }) {
  let asked = 0;
  const record = (entry) => {
    if (log) appendFileSync(log, `${JSON.stringify({ time: new Date().toISOString(), model, ...entry })}\n`);
  };
  return createServer(async (request, response) => {
    const send = (status, text) => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`${text}\n`);
    };
    if (request.method === 'GET' && request.url === '/health') return send(200, 'ok');
    if (request.method !== 'POST' || request.url !== '/ask') return send(404, 'POST /ask with the question as the body');
    let question = '';
    for await (const chunk of request) {
      question += chunk;
      if (question.length > MAX_QUESTION) return send(413, `The question is longer than ${MAX_QUESTION} characters. Ask about one fact or one step.`);
    }
    question = question.trim();
    if (!question) return send(400, 'The question is empty.');
    if (asked >= maxQuestions) return send(429, `The baseline has answered its ${maxQuestions} questions for this review.`);
    asked += 1;
    try {
      const answer = await ask(question, { endpoint, model, apiKey, fetchImpl });
      record({ question, answer });
      return send(200, answer);
    } catch (error) {
      record({ question, error: error.message });
      return send(502, `The baseline could not answer: ${error.message}`);
    }
  });
}

function main() {
  const {
    AWS_BEARER_TOKEN_BEDROCK: apiKey, AWS_REGION: region = 'us-west-2', BASELINE_MODEL: model,
    BASELINE_PORT: port = '8799', BASELINE_MAX_QUESTIONS: max = '30', BASELINE_LOG: log, BASELINE_ENDPOINT,
  } = process.env;
  if (!apiKey || !model) {
    console.error('baseline: AWS_BEARER_TOKEN_BEDROCK and BASELINE_MODEL are required');
    process.exit(2);
  }
  const endpoint = BASELINE_ENDPOINT || `https://bedrock-runtime.${region}.amazonaws.com`;
  createBaseline({ endpoint, model, apiKey, maxQuestions: Number(max), log })
    .listen(Number(port), '127.0.0.1', () => console.log(`baseline: ${model} on 127.0.0.1:${port}, up to ${max} questions`));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
