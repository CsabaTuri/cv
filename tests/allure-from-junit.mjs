// The unit suite reports JUnit XML, and Allure does not read that. This turns
// the XML into Allure result files, so one Allure report covers everything: the
// Playwright results are written by `allure-playwright` itself, these are added
// next to them and `allure generate` renders the lot.
//
//   node tests/allure-from-junit.mjs test-results/junit.xml \
//     --parent "Unit tests (Node 22)" --out allure-results
//
// The parser is the one the run summary already uses, so a change in how
// `node --test` writes its XML is fixed in one place only.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJUnit } from '../.github/scripts/test-summary.mjs';

const DEFAULT_OUT = 'allure-results';

/** A stable id per test, so the report can grow a history across runs. */
function historyId(suite, name) {
  return `${suite} # ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function resultsFrom({ suites, parent, start }) {
  const results = [];
  let clock = start;

  for (const suite of suites) {
    for (const item of suite.cases) {
      const duration = Math.round(item.time * 1000);
      const status = { passed: 'passed', failed: 'failed', skipped: 'skipped' }[item.status];

      results.push({
        uuid: `${historyId(suite.name, item.name)}-${clock}`,
        historyId: historyId(suite.name, item.name),
        name: item.name,
        fullName: `${suite.name} ${item.name}`,
        status,
        statusDetails:
          status === 'failed'
            ? { message: item.message.slice(0, 4000), trace: item.details.slice(0, 20000) }
            : {},
        stage: 'finished',
        start: clock,
        stop: clock + duration,
        labels: [
          { name: 'parentSuite', value: parent },
          { name: 'suite', value: suite.name },
          { name: 'framework', value: 'node --test' },
          { name: 'language', value: 'javascript' },
          { name: 'host', value: process.env.HOSTNAME ?? 'ci' },
        ],
      });

      clock += duration + 1;
    }
  }

  return results;
}

function parseArguments(argv) {
  const files = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out' || argument === '--parent') {
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
  if (!files.length) {
    console.error('usage: allure-from-junit.mjs <junit.xml...> [--parent LABEL] [--out DIR]');
    return 1;
  }

  const out = options.out ?? DEFAULT_OUT;
  const parent = options.parent ?? 'Unit tests';
  // One run, one timeline: the suites follow each other instead of overlapping,
  // because the XML only carries durations, not absolute times.
  let start = Date.now();
  let written = 0;

  for (const file of files) {
    let suites;
    try {
      suites = parseJUnit(readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(
        `[allure] skipping ${file}: ${error.code === 'ENOENT' ? 'no such file' : error.message}`,
      );
      continue;
    }

    const label = files.length > 1 ? `${parent} - ${file.split('/').pop()}` : parent;
    const results = resultsFrom({ suites, parent: label, start });

    mkdirSync(out, { recursive: true });
    for (const result of results) {
      // Allure only picks up `<id>-result.json`: a plain `.json` is ignored, and
      // the report would quietly be missing every test from this file.
      writeFileSync(join(out, `${result.uuid}-result.json`), JSON.stringify(result));
      written += 1;
    }

    start = results.length ? results[results.length - 1].stop + 1 : start;
  }

  console.log(`[allure] ${written} result(s) written to ${out}`);
  return 0;
}

if (process.argv[1]?.endsWith('allure-from-junit.mjs')) {
  process.exitCode = main(process.argv.slice(2));
}
