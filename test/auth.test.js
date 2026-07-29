// Authentication tests — no database needed.
//
// Two things are covered here:
// 1. Real bcrypt hash/compare behaviour (the actual password-checking
//    logic used by app.js on login) — this runs for real, no mocking.
// 2. The role-based access control rules in app.js (requireRole /
//    requireLogin / requireAdmin), checked via source inspection since
//    app.js is the entry script and doesn't export these for direct
//    import. This follows the same pattern as the existing smoke tests.
//
// Run with: npm test  (node --test)
const test = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("bcrypt: correct password matches its own hash", async () => {
    const hash = await bcrypt.hash("correct-horse-battery-staple", 10);
    const matches = await bcrypt.compare("correct-horse-battery-staple", hash);
    assert.strictEqual(matches, true);
});

test("bcrypt: wrong password does not match", async () => {
    const hash = await bcrypt.hash("correct-horse-battery-staple", 10);
    const matches = await bcrypt.compare("wrong-password", hash);
    assert.strictEqual(matches, false);
});

test("bcrypt: hashing the same password twice produces different hashes", async () => {
    // bcrypt salts automatically — this guards against someone "optimising"
    // login by comparing hashes directly instead of using bcrypt.compare.
    const hashA = await bcrypt.hash("same-password", 10);
    const hashB = await bcrypt.hash("same-password", 10);
    assert.notStrictEqual(hashA, hashB);
});

test("login route rejects an unrecognised role before checking credentials", () => {
    assert.match(
        appSrc,
        /role !== "student" && role !== "admin"/,
        "login POST route should reject any role other than student/admin"
    );
});

test("login route checks the password with bcrypt.compare, not a plain equality check", () => {
    assert.match(
        appSrc,
        /bcrypt\.compare\(password, user\.password_hash\)/,
        "password check should go through bcrypt.compare"
    );
});

test("login route enforces that the account's role matches the login page used", () => {
    assert.match(
        appSrc,
        /user\.role !== role/,
        "an admin account should not be able to log in through the student page or vice versa"
    );
});

test("requireRole redirects to /welcome when there is no session (not logged in)", () => {
    assert.match(
        appSrc,
        /if \(!req\.session\.user\) return res\.redirect\("\/welcome"\)/,
        "unauthenticated requests should be redirected to /welcome"
    );
});

test("requireRole redirects a mismatched role to /home instead of granting access", () => {
    assert.match(
        appSrc,
        /if \(role && req\.session\.user\.role !== role\) return res\.redirect\("\/home"\)/,
        "a student hitting an admin-only route should be redirected, not given access"
    );
});

test("admin-only routes are actually protected by requireAdmin", () => {
    const adminRoutes = [
        /app\.get\('\/admin\/reports'.*requireAdmin/,
        /app\.get\('\/admin\/loans'.*requireAdmin/,
        /app\.post\('\/admin\/inventory\/:id\/delete'.*requireAdmin/
    ];

    for (const pattern of adminRoutes) {
        assert.match(appSrc, pattern, `expected route to be guarded by requireAdmin: ${pattern}`);
    }
});
