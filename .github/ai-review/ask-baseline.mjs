#!/usr/bin/env node
// reviewer: asks the baseline model one question and prints its answer.
//   ask-baseline "How do I pin a Node version in a GitHub Actions workflow?"
//   echo "a longer question" | ask-baseline
// Every call is a new conversation: the baseline knows only what the question says.
const port = process.env.BASELINE_PORT || '8799';
let question = process.argv.slice(2).join(' ').trim();
if (!question && !process.stdin.isTTY) {
  for await (const chunk of process.stdin) question += chunk;
}
if (!question.trim()) {
  console.error('usage: ask-baseline "<question>"   (or the question on stdin)');
  process.exit(2);
}
try {
  const response = await fetch(`http://127.0.0.1:${port}/ask`, { method: 'POST', body: question });
  const text = (await response.text()).trim();
  if (!response.ok) {
    console.error(text);
    process.exit(1);
  }
  console.log(text);
} catch (error) {
  console.error(`ask-baseline: the baseline is not running (${error.message})`);
  process.exit(1);
}
