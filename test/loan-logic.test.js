// Core loan business logic tests — no database needed.
//
// These test the pure helper functions extracted from loanModel.js
// (computeLoanProgress, formatDate) directly, with no mocking required:
// requiring the model module is safe because database.js lazily creates
// a connection pool and never throws at require-time even if MySQL is
// unreachable (its connectivity check is wrapped in try/catch).
//
// Run with: npm test  (node --test)
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const loanModel = require(path.join(__dirname, "..", "models", "loanModel"));

test("LOAN_REASONS lists both accepted loan reasons", () => {
    assert.strictEqual(loanModel.LOAN_REASONS.financial, "Financial reasons");
    assert.strictEqual(loanModel.LOAN_REASONS.maintenance, "Own laptop under maintenance");
});

test("formatDate returns a placeholder for a null/undefined date", () => {
    assert.strictEqual(loanModel.formatDate(null), "-");
    assert.strictEqual(loanModel.formatDate(undefined), "-");
});

test("formatDate formats a real date in the expected long form", () => {
    const formatted = loanModel.formatDate("2026-06-30");
    assert.match(formatted, /30/);
    assert.match(formatted, /June/);
    assert.match(formatted, /2026/);
});

test("computeLoanProgress: a loan with time left is active, not overdue", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const result = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", null, now);

    assert.strictEqual(result.status, "active");
    assert.strictEqual(result.overdue, false);
    assert.strictEqual(result.daysRemaining, 15);
});

test("computeLoanProgress: a loan past its due date with no return is overdue", () => {
    const now = new Date("2026-07-05T00:00:00Z");
    const result = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", null, now);

    assert.strictEqual(result.status, "active");
    assert.strictEqual(result.overdue, true);
    assert.ok(result.daysRemaining < 0, "daysRemaining should be negative once overdue");
});

test("computeLoanProgress: a returned loan is never marked overdue, even if returned late", () => {
    const now = new Date("2026-07-10T00:00:00Z");
    const result = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", "2026-07-05", now);

    assert.strictEqual(result.status, "returned");
    assert.strictEqual(result.overdue, false, "a returned loan should never show as overdue");
});

test("computeLoanProgress: percentElapsed is 0 right at the borrow date", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const result = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", null, now);

    assert.strictEqual(result.percentElapsed, 0);
});

test("computeLoanProgress: percentElapsed is 100 once the due date has passed", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const result = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", null, now);

    assert.strictEqual(result.percentElapsed, 100);
});

test("computeLoanProgress: percentElapsed sits roughly halfway through a loan period", () => {
    const now = new Date("2026-06-16T00:00:00Z"); // ~halfway between Jun 1 and Jul 1
    const result = loanModel.computeLoanProgress("2026-06-01", "2026-07-01", null, now);

    assert.ok(result.percentElapsed >= 45 && result.percentElapsed <= 55,
        `expected roughly 50%, got ${result.percentElapsed}%`);
});

test("computeLoanProgress: never returns a percentage above 100 or below 0", () => {
    const wayBefore = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", null, new Date("2026-01-01"));
    const wayAfter = loanModel.computeLoanProgress("2026-06-01", "2026-06-30", null, new Date("2027-01-01"));

    assert.ok(wayBefore.percentElapsed >= 0);
    assert.ok(wayAfter.percentElapsed <= 100);
});
