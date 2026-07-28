// Dashboard analytics tests — no database needed.
//
// Covers the pure date-range logic behind the "Monthly Loan Trends" and
// "Most Borrowed Models" charts added to /admin/reports (addressing the
// lecturer's feedback on dashboard analytics). The actual DB-querying
// functions (getMostBorrowedModels, getMonthlyLoanTrends) are not
// exercised here since they need a live MySQL connection — only the
// pure buildMonthRange helper they're built on is unit tested directly.
//
// Run with: npm test  (node --test)
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const reportModel = require(path.join(__dirname, "..", "models", "reportModel"));

test("buildMonthRange returns exactly the requested number of months", () => {
    const range = reportModel.buildMonthRange(6, new Map(), new Date("2026-07-15"));
    assert.strictEqual(range.length, 6);
});

test("buildMonthRange ends on the reference month, in chronological order", () => {
    const range = reportModel.buildMonthRange(3, new Map(), new Date("2026-07-15"));
    assert.deepStrictEqual(range.map(r => r.yearMonth), ["2026-05", "2026-06", "2026-07"]);
});

test("buildMonthRange zero-fills months with no recorded loans", () => {
    const counts = new Map([["2026-07", 4]]); // only July has data
    const range = reportModel.buildMonthRange(3, counts, new Date("2026-07-15"));

    const may = range.find(r => r.yearMonth === "2026-05");
    const june = range.find(r => r.yearMonth === "2026-06");
    const july = range.find(r => r.yearMonth === "2026-07");

    assert.strictEqual(may.totalLoans, 0, "a month with no loans should show 0, not be skipped");
    assert.strictEqual(june.totalLoans, 0);
    assert.strictEqual(july.totalLoans, 4);
});

test("buildMonthRange produces a human-readable label alongside the raw yearMonth key", () => {
    const range = reportModel.buildMonthRange(1, new Map(), new Date("2026-07-15"));
    assert.strictEqual(range[0].yearMonth, "2026-07");
    assert.match(range[0].label, /Jul/);
    assert.match(range[0].label, /2026/);
});

test("buildMonthRange handles a December-to-January year rollover correctly", () => {
    const range = reportModel.buildMonthRange(3, new Map(), new Date("2026-01-15"));
    assert.deepStrictEqual(range.map(r => r.yearMonth), ["2025-11", "2025-12", "2026-01"]);
});

test("formatDateTime returns a placeholder for a missing date", () => {
    assert.strictEqual(reportModel.formatDateTime(null), "-");
});
