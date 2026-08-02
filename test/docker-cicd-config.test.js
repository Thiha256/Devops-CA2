// Docker / CI-CD configuration tests — no Docker daemon needed.
//
// These don't spin up containers (that needs a Docker daemon, which CI's
// default ubuntu-latest runner does have, but that's a separate, heavier
// check — see docker-build.sh for that). What these tests catch instead
// is misconfiguration: someone edits the Dockerfile or docker-compose.yml
// and accidentally breaks the port mapping, forgets the healthcheck, or
// points the containerised app at the wrong DB host — all without
// needing to actually build anything, so it runs fast as part of the
// normal `npm test` step in ci.yml.
//
// Run with: npm test  (node --test)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const root = path.join(__dirname, "..");
const dockerfilePath = path.join(root, "Dockerfile");
const composePath = path.join(root, "docker-compose.yml");

function readDockerfile() {
    return fs.readFileSync(dockerfilePath, "utf8");
}

function readCompose() {
    return yaml.load(fs.readFileSync(composePath, "utf8"));
}

// ---------- Dockerfile ----------

test("Dockerfile exists", () => {
    assert.ok(fs.existsSync(dockerfilePath), "Dockerfile should exist at the project root");
});

test("Dockerfile uses a pinned Node base image, not a floating 'latest' tag", () => {
    const dockerfile = readDockerfile();
    const fromLine = dockerfile.split("\n").find(line => line.trim().startsWith("FROM"));

    assert.ok(fromLine, "Dockerfile should have a FROM instruction");
    assert.doesNotMatch(fromLine, /:latest/, "avoid ':latest' — it makes builds non-reproducible");
    assert.match(fromLine, /node:\d+/, "base image should be a pinned Node version");
});

test("Dockerfile installs dependencies before copying the rest of the app (layer caching)", () => {
    const dockerfile = readDockerfile();
    const copyPackageIdx = dockerfile.indexOf("COPY package");
    const npmCiIdx = dockerfile.indexOf("RUN npm ci");
    const copyRestIdx = dockerfile.indexOf("COPY . .");

    assert.ok(copyPackageIdx !== -1, "should COPY package*.json before installing");
    assert.ok(npmCiIdx > copyPackageIdx, "npm ci should run after copying package files");
    assert.ok(copyRestIdx > npmCiIdx, "app source should be copied after dependencies are installed");
});

test("Dockerfile declares a HEALTHCHECK", () => {
    const dockerfile = readDockerfile();
    assert.match(dockerfile, /HEALTHCHECK/, "Dockerfile should declare a HEALTHCHECK so orchestration tools know when the app is actually ready");
});

test("Dockerfile EXPOSEs the same port the app actually listens on", () => {
    const dockerfile = readDockerfile();
    const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");

    const exposeMatch = dockerfile.match(/EXPOSE\s+(\d+)/);
    const portMatch = appSrc.match(/const PORT\s*=\s*(\d+)/);

    assert.ok(exposeMatch, "Dockerfile should EXPOSE a port");
    assert.ok(portMatch, "app.js should define a PORT constant");
    assert.strictEqual(exposeMatch[1], portMatch[1],
        `Dockerfile EXPOSEs port ${exposeMatch[1]} but app.js listens on ${portMatch[1]}`);
});

test("Dockerfile's HEALTHCHECK targets the same port the app listens on", () => {
    const dockerfile = readDockerfile();
    const portMatch = dockerfile.match(/EXPOSE\s+(\d+)/);
    const healthcheckLine = dockerfile.split("\n").find(line => line.includes("CMD") && line.includes("http://localhost"));

    assert.ok(healthcheckLine, "HEALTHCHECK should CMD-probe an HTTP endpoint");
    assert.ok(healthcheckLine.includes(`:${portMatch[1]}`),
        "HEALTHCHECK should probe the same port declared in EXPOSE");
});

// ---------- docker-compose.yml ----------

test("docker-compose.yml exists and parses as valid YAML", () => {
    assert.ok(fs.existsSync(composePath), "docker-compose.yml should exist at the project root");
    assert.doesNotThrow(() => readCompose(), "docker-compose.yml should be valid YAML");
});

test("docker-compose.yml defines both the app and db services", () => {
    const compose = readCompose();
    assert.ok(compose.services, "compose file should define services");
    assert.ok(compose.services.app, "an 'app' service should be defined");
    assert.ok(compose.services.db, "a 'db' service should be defined");
});

test("the app service's port mapping matches the Dockerfile's EXPOSEd port", () => {
    const compose = readCompose();
    const dockerfile = readDockerfile();
    const exposeMatch = dockerfile.match(/EXPOSE\s+(\d+)/);

    const ports = compose.services.app.ports || [];
    const matchesExposedPort = ports.some(p => String(p).includes(String(exposeMatch[1])));

    assert.ok(matchesExposedPort,
        `app service ports (${ports.join(", ")}) should include the Dockerfile's exposed port ${exposeMatch[1]}`);
});

test("the app service waits for the db to be healthy before starting", () => {
    const compose = readCompose();
    const dependsOn = compose.services.app.depends_on;

    assert.ok(dependsOn && dependsOn.db, "app service should depend on the db service");
    assert.strictEqual(dependsOn.db.condition, "service_healthy",
        "app should wait for db's healthcheck to pass, not just for the container to start " +
        "(otherwise the app can race the database and fail to connect on first boot)");
});

test("the db service declares its own healthcheck", () => {
    const compose = readCompose();
    assert.ok(compose.services.db.healthcheck, "db service should declare a healthcheck for depends_on: condition: service_healthy to work at all");
});

test("inside the compose network, the app is pointed at the db by service name, not localhost", () => {
    const compose = readCompose();
    const env = compose.services.app.environment || {};

    assert.strictEqual(env.DB_HOST, "db",
        "DB_HOST must be overridden to the compose service name ('db') — " +
        "127.0.0.1/localhost would point the app at itself inside its own container, not the database");
});

test("the db service does not hardcode a password in plain text", () => {
    const compose = readCompose();
    const rootPassword = compose.services.db.environment.MYSQL_ROOT_PASSWORD;

    assert.match(String(rootPassword), /\$\{.*\}/,
        "MYSQL_ROOT_PASSWORD should come from an environment variable (e.g. ${DB_PASSWORD}), not a literal password committed to the repo");
});
