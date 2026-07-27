// Basic smoke tests — no database needed, so they run cleanly in CI.
// They check the project is structurally sound (files exist, deps declared,
// key routes present). Run with: npm test  (node --test).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

test("core files exist", () => {
    for (const file of ["app.js", "database.js", "package.json"]) {
        assert.ok(fs.existsSync(path.join(root, file)), `${file} should exist`);
    }
});

test("key model files exist", () => {
    for (const file of ["userModel.js", "loanModel.js"]) {
        assert.ok(fs.existsSync(path.join(root, "models", file)), `models/${file} should exist`);
    }
});

test("package.json declares the required dependencies", () => {
    const pkg = require(path.join(root, "package.json"));
    for (const dep of ["express", "ejs", "mysql2", "bcryptjs", "express-session"]) {
        assert.ok(pkg.dependencies[dep], `dependency "${dep}" should be listed`);
    }
});

test("app.js defines the login and loan-request routes", () => {
    const src = fs.readFileSync(path.join(root, "app.js"), "utf8");
    assert.match(src, /app\.post\("\/login\/:role"/, "login POST route should exist");
    assert.match(src, /app\.post\("\/loans\/request"/, "loan-request route should exist");
});
