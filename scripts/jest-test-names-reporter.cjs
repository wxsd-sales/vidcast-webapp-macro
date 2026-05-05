const path = require("node:path");

class TestNamesReporter {
  onTestResult(test, testResult) {
    const status =
      testResult.numFailingTests > 0 || testResult.testExecError
        ? "FAIL"
        : "PASS";

    write(`${status} ${relativeTestPath(test)}\n`);

    if (testResult.testExecError) {
      write(`${indent(testResult.testExecError.stack || testResult.testExecError.message)}\n`);
    }

    for (const result of testResult.testResults) {
      const title = [...result.ancestorTitles, result.title].join(" - ");
      write(`  ${formatStatus(result.status)} ${title}\n`);

      if (result.status == "failed") {
        for (const message of result.failureMessages || []) {
          write(`${indent(message)}\n`);
        }
      }
    }
  }

  onRunComplete(_, results) {
    write("\n");
    write(
      `Test Suites: ${formatCounts({
        failed: results.numFailedTestSuites,
        passed: results.numPassedTestSuites,
        skipped: results.numPendingTestSuites,
        total: results.numTotalTestSuites,
      })}\n`,
    );
    write(
      `Tests: ${formatCounts({
        failed: results.numFailedTests,
        passed: results.numPassedTests,
        skipped: results.numPendingTests,
        todo: results.numTodoTests,
        total: results.numTotalTests,
      })}\n`,
    );
    write(`Snapshots: ${formatSnapshotCounts(results.snapshot)}\n`);
    write(`Time: ${formatRunTime(results.startTime)}\n`);
  }
}

function relativeTestPath(test) {
  return path.relative(process.cwd(), test.path);
}

function formatStatus(status) {
  if (status == "passed") return "PASS";
  if (status == "failed") return "FAIL";
  if (status == "pending") return "SKIP";
  if (status == "todo") return "TODO";
  return status.toUpperCase();
}

function formatCounts({ failed = 0, passed = 0, skipped = 0, todo = 0, total }) {
  const parts = [];

  if (failed) parts.push(`${failed} failed`);
  if (passed) parts.push(`${passed} passed`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (todo) parts.push(`${todo} todo`);
  parts.push(`${total} total`);

  return parts.join(", ");
}

function formatSnapshotCounts(snapshot = {}) {
  const total = snapshot.total || 0;
  if (!total) return "0 total";

  return formatCounts({
    failed: snapshot.unmatched,
    passed: snapshot.matched,
    skipped: snapshot.filesRemoved,
    total,
  });
}

function formatRunTime(startTime) {
  const elapsedMs = Date.now() - startTime;
  return `${(elapsedMs / 1000).toFixed(3)} s`;
}

function indent(text, spaces = 4) {
  const padding = " ".repeat(spaces);
  return String(text)
    .trim()
    .split("\n")
    .map((line) => `${padding}${line}`)
    .join("\n");
}

function write(text) {
  process.stderr.write(text);
}

module.exports = TestNamesReporter;
