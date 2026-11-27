require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    // DB_* is used locally / on EC2; MYSQL* is what Railway's MySQL service provides
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_DATABASE || "resource_centre_db",
    // Cloud MySQL hosts (TiDB Cloud, Aiven...) need DB_SSL=true
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function checkPool(retriesLeft = 5) {
    try {
        await pool.query("SELECT 1");
        console.log("Connection established on", process.env.DB_DATABASE || "resource_centre_db");
    } catch (err) {
        if (retriesLeft > 0) {
            // DB container (e.g. MySQL running its init scripts) may still be starting up.
            setTimeout(() => checkPool(retriesLeft - 1), 2000);
            return;
        }
        console.error("Failed to connect to DB:", err.message);
    }
}
// Only run the startup connectivity check when the app itself is being run
// (node app.js). When a unit test merely imports a model, we skip it so the
// pool doesn't open a lingering connection that keeps the test runner alive.
if (require.main && require.main.filename && require.main.filename.endsWith("app.js")) {
    checkPool();
}

module.exports = pool;
