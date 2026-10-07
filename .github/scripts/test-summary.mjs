// Turns the JUnit XML that `node --test` writes into the test report: the
// summary shown on the workflow run, the body of the pull request comment and
// the file kept as a build artifact.
//
//   node .github/scripts/test-summary.mjs test-results/junit.xml \
//     --title "API (Node 20)" --out test-results/summary.md
//
// It prints the report to stdout, appends it to $GITHUB_STEP_SUMMARY when that
// is set (the Actions summary) and writes it to --out when given. It never
// fails the build: a missing or unreadable file becomes a line in the report,
// because this step must not hide the real test failure.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_FAILURES = 10;
const MAX_FAILURE_CHARS = 1200;
const MAX_MESSAGE_LINES = 12;
const MAX_REPORT_CHARS = 60000;

const ANSI = /\u001b\[[0-9;]*m/g;

export function decodeEntities(value) {
  return String(value)
    // `node --test` escapes the quotes inside attribute values twice
    // (`"` -> `&quot;` -> `&amp;quot;`), so that pair has to resolve first.
    .replaceAll('&amp;quot;', '&quot;')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

function attributes(tag) {
  const found = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    found[match[1]] = decodeEntities(match[2]);
  }
  return found;
}

function dedent(text) {
  const lines = text.replace(ANSI, '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(indent)).join('\n');
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}\n… (truncated)`;
}

function failureText(inner) {
  const match = inner.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/);
  if (!match) return { message: '', details: '' };
  const message = attributes(`<${match[1]} ${match[2]}>`).message ?? '';
  return { message, details: decodeEntities(dedent(match[3])) };
}

/**
 * Parses the JUnit XML of `node --test` into per-suite results. The counts come
 * from the test cases themselves, so they stay right even if the attributes of
 * a suite disagree with what it contains.
 */
export function parseJUnit(xml) {
  const suites = [];
  const suiteAt = [];
  for (const match of String(xml).matchAll(/<testsuite\b([^>]*?)\/?>/g)) {
    const meta = attributes(match[0]);
    const suite = { name: meta.name ?? 'tests', time: Number(meta.time ?? 0), cases: [] };
    suites.push(suite);
    suiteAt.push({ index: match.index, suite });
  }
  if (!suites.length) suites.push({ name: 'tests', time: 0, cases: [] });

  const suiteFor = (position) => {
    let current = suites[0];
    for (const entry of suiteAt) {
      if (entry.index >= position) break;
      current = entry.suite;
    }
    return current;
  };

  for (const match of String(xml).matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const inner = match[2] ?? '';
    const meta = attributes(match[1]);
    const skipped = /<skipped\b/.test(inner);
    const failed = /<(failure|error)\b/.test(inner);
    const { message, details } = failureText(inner);
    const plain = decodeEntities(dedent(inner.replace(/<[^>]*>/g, ' ')));
    const suite = suiteFor(match.index);
    suite.cases.push({
      name: meta.name ?? 'unnamed',
      suite: suite.name,
      time: Number(meta.time ?? 0),
      status: skipped ? 'skipped' : failed ? 'failed' : 'passed',
      message: truncate(message || plain, MAX_FAILURE_CHARS),
      details: truncate(details || plain, MAX_FAILURE_CHARS),
    });
  }

  return suites;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function seconds(value) {
  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} s`;
}

/** Renders the markdown shown on the run page and in the pull request. */
export function renderReport(suites, { title = 'Test report', notes = [], failures = MAX_FAILURES } = {}) {
  const cases = suites.flatMap((suite) => suite.cases);
  const count = (status) => cases.filter((item) => item.status === status).length;
  const passed = count('passed');
  const failed = count('failed');
  const skipped = count('skipped');
  const time = suites.reduce((total, suite) => total + suite.time, 0);

  const lines = [`## 🧪 ${title}`, ''];
  for (const note of notes) lines.push(`> ⚠️ ${note}`, '');
  if (!cases.length) {
    lines.push(
      '⚠️ No test results were produced — the run stopped before the tests reported anything.',
      '',
      'The reason is in the log of the test step: a syntax error, a missing database or a crash',
      'while loading a test file all show up there and never reach the report.',
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    failed
      ? `**❌ ${plural(failed, 'test failed', 'tests failed')}** of ${plural(cases.length, 'test', 'tests')} — ${passed} passed, ${skipped} skipped, ${seconds(time)}`
      : `**✅ All ${plural(cases.length, 'test', 'tests')} passed** — ${skipped} skipped, ${seconds(time)}`,
    '',
    '| Suite | Tests | ✅ | ❌ | ⏭ | Time |',
    '| --- | --: | --: | --: | --: | --: |',
  );

  for (const suite of suites) {
    if (!suite.cases.length) continue;
    const inner = ['passed', 'failed', 'skipped'].map((status) =>
      suite.cases.filter((item) => item.status === status).length,
    );
    lines.push(
      `| ${suite.name} | ${suite.cases.length} | ${inner[0]} | ${inner[1]} | ${inner[2]} | ${seconds(suite.time)} |`,
    );
  }
  lines.push('');

  const broken = cases.filter((item) => item.status === 'failed');
  if (broken.length) {
    lines.push('### ❌ Failures', '');
    for (const item of broken.slice(0, failures)) {
      lines.push(
        '<details>',
        `<summary><b>${item.suite}</b> › ${item.name}</summary>`,
        '',
        '```text',
        item.message.split('\n').slice(0, MAX_MESSAGE_LINES).join('\n').trimEnd(),
        '```',
        '',
        '</details>',
        '',
      );
    }
    if (broken.length > failures) {
      lines.push(`${broken.length - failures} further failure(s) — the job log has the rest.`, '');
    }
  }

  // A pull request comment is capped at 64 KiB, and every run should stay well
  // below the limit of the Actions summary too.
  const report = `${lines.join('\n')}\n`;
  return report.length > MAX_REPORT_CHARS
    ? `${report.slice(0, MAX_REPORT_CHARS).trimEnd()}\n\n… (report truncated)\n`
    : report;
}

function parseArguments(argv) {
  const files = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--title' || argument === '--out') {
      options[argument.slice(2)] = argv[index + 1];
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      files.push(argument);
    }
  }
  return { files, options };
}

function main(argv) {
  const { files, options } = parseArguments(argv);
  const title = options.title ?? 'Test report';

  if (!files.length) {
    console.error('usage: test-summary.mjs <junit.xml...> [--title T] [--out FILE]');
    return 1;
  }

  const suites = [];
  const notes = [];
  for (const file of files) {
    try {
      suites.push(...parseJUnit(readFileSync(file, 'utf8')));
    } catch (error) {
      // Say it out loud, but do not fail the job: the step that produced no XML
      // has already failed on its own, and this one only writes the report.
      notes.push(`${file}: ${error.code === 'ENOENT' ? 'no report was written' : error.message}`);
    }
  }

  const report = renderReport(suites, { title, notes });
  process.stdout.write(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${report}`);
  }
  if (options.out) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, report);
  }
  return 0;
}

if (process.argv[1]?.endsWith('test-summary.mjs')) {
  process.exitCode = main(process.argv.slice(2));
}
