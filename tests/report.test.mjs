// The test report is what makes a red run readable without opening the raw log,
// so it is parser code that has to keep working: a silently wrong summary is
// worse than no summary. The fixtures below are the actual shapes `node --test`
// writes (checked against Node 22), including the double-escaped quotes it puts
// in attributes.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeEntities, parseJUnit, renderReport } from '../.github/scripts/test-summary.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, '.github', 'scripts', 'test-summary.mjs');

const PASSING = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
\t<testsuite name="visitor chat" time="0.012345" disabled="0" errors="0" tests="2" failures="0" skipped="0" hostname="runner">
\t\t<testcase name="stores a message" time="0.003" classname="test"/>
\t\t<testcase name="returns only the messages after the cursor" time="0.002" classname="test"/>
\t</testsuite>
\t<testsuite name="service worker" time="0.150000" disabled="0" errors="0" tests="3" failures="1" skipped="1" hostname="runner">
\t\t<testcase name="never caches the API" time="0.001" classname="test"/>
\t\t<testcase name="handles the push event" time="0.002" classname="test" failure="expected push&amp;quot;s&amp;quot; &lt; 1">
\t\t\t<failure type="testCodeFailure" message="expected push&amp;quot;s&amp;quot; &lt; 1">
Error [ERR_TEST_FAILURE]: expected push&lt;s&gt; &amp; "x"

1 !== 2

    at TestContext.&lt;anonymous&gt; (file:///home/runner/tests/assets.test.mjs:41:7)
\t\t\t</failure>
\t\t</testcase>
\t\t<testcase name="skips without a browser" time="0.001" classname="test">
\t\t\t<skipped type="skipped" message="no browser"/>
\t\t</testcase>
\t</testsuite>
\t<!-- tests 5 -->
</testsuites>
`;

describe('test report', () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'cv-report-'));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts the tests per suite from the cases themselves', () => {
    const suites = parseJUnit(PASSING);
    assert.deepEqual(
      suites.map((suite) => suite.name),
      ['visitor chat', 'service worker'],
    );
    assert.deepEqual(
      suites[0].cases.map((item) => item.status),
      ['passed', 'passed'],
    );
    assert.deepEqual(
      suites[1].cases.map((item) => item.status),
      ['passed', 'failed', 'skipped'],
    );
  });

  it('unescapes the message of a failure, including the double-escaped quotes', () => {
    const failure = parseJUnit(PASSING)[1].cases[1];
    assert.equal(failure.message, 'expected push"s" < 1');
    assert.match(failure.details, /1 !== 2/);
    assert.match(failure.details, /assets\.test\.mjs/);
    assert.ok(!failure.details.includes('&lt;'), 'the stack trace still carries entities');
  });

  it('renders a red report with the totals and the per-suite table', () => {
    const report = renderReport(parseJUnit(PASSING), { title: 'API (Node 20)' });
    assert.match(report, /^## 🧪 API \(Node 20\)/);
    assert.match(report, /\*\*❌ 1 test failed\*\* of 5 tests — 3 passed, 1 skipped, 0\.16 s/);
    assert.match(report, /\| visitor chat \| 2 \| 2 \| 0 \| 0 \| 0\.01 s \|/);
    assert.match(report, /\| service worker \| 3 \| 1 \| 1 \| 1 \| 0\.15 s \|/);
    assert.match(report, /### ❌ Failures/);
    assert.match(report, /<summary><b>service worker<\/b> › handles the push event<\/summary>/);
    assert.match(report, /expected push"s" < 1/, 'the message reaches the report as plain text');
  });

  it('renders an all green report without a failure section', () => {
    const xml = PASSING.replace(
      /\t\t<testcase name="handles the push[\s\S]*?<\/testcase>\n/,
      '',
    ).replace(/\t\t<testcase name="skips without a browser"[\s\S]*?<\/testcase>\n/, '');
    const report = renderReport(parseJUnit(xml), {});
    assert.match(report, /\*\*✅ All 3 tests passed\*\* — 0 skipped/);
    assert.ok(!report.includes('### ❌ Failures'), 'a green run has no failure section');
  });

  it('keeps the report readable when a failure message is huge', () => {
    const huge = `<?xml version="1.0"?><testsuites><testsuite name="big" time="0.1">
<testcase name="explodes" time="0.1"><failure message="${'x'.repeat(5000)}">
short body
</failure></testcase></testsuite></testsuites>`;
    const report = renderReport(parseJUnit(huge), {});
    assert.match(report, /… \(truncated\)/);
    assert.ok(report.length < 4000, `report grew to ${report.length} characters`);
  });

  it('shows the message of a failure, not the whole stack trace', () => {
    const deep = `<?xml version="1.0"?><testsuites><testsuite name="deep" time="0.1">
<testcase name="sinks" time="0.1"><failure message="one clear line">
${Array.from({ length: 400 }, (_, index) => `frame ${index}`).join('\n')}
</failure></testcase></testsuite></testsuites>`;
    const report = renderReport(parseJUnit(deep), {});
    assert.match(report, /one clear line/);
    assert.ok(!report.includes('frame 399'), 'the stack trace does not belong in the report');
    assert.ok(report.length < 1500, `report grew to ${report.length} characters`);
  });

  it('says so when a run produced no results at all', () => {
    const report = renderReport(parseJUnit('<testsuites></testsuites>'), { title: 'API' });
    assert.match(report, /No test results were produced/);
    assert.ok(!report.includes('| Suite |'), 'an empty report has no table');
  });

  it('carries the notes about a report that could not be read', () => {
    const report = renderReport(parseJUnit(PASSING), {
      title: 'API',
      notes: ['junit-20.xml: no report was written'],
    });
    assert.match(report, /> ⚠️ junit-20\.xml: no report was written/);
    assert.match(report, /\*\*❌ 1 test failed\*\*/);
  });

  it('decodes the entities of the runner, not more', () => {
    assert.equal(
      decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &amp;quot;e&amp;quot;'),
      'a & b <c> "d" "e"',
    );
  });

  it('writes the Actions summary, the pull request body and prints the report', () => {
    const xml = join(dir, 'junit.xml');
    const summary = join(dir, 'step-summary.md');
    const out = join(dir, 'nested', 'summary.md');
    writeFileSync(xml, PASSING);

    const run = spawnSync(
      process.execPath,
      [SCRIPT, xml, '--title', 'API (Node 22)', '--out', out],
      { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary } },
    );

    assert.equal(run.status, 0, run.stderr);
    const body = readFileSync(out, 'utf8');
    assert.match(body, /^## 🧪 API \(Node 22\)/m);
    assert.match(readFileSync(summary, 'utf8'), /## 🧪 API \(Node 22\)/);
    assert.equal(run.stdout.trim(), body.trim());
  });

  it('does not fail the job when the report file is missing', () => {
    const run = spawnSync(process.execPath, [SCRIPT, join(dir, 'not-produced.xml')], {
      encoding: 'utf8',
    });
    assert.equal(
      run.status,
      0,
      'a missing report must not turn a red run into a different failure',
    );
    assert.match(run.stdout, /no report was written/);
    assert.match(run.stdout, /No test results were produced/);
  });
});
