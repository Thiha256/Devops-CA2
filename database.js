require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function checkPool(retriesLeft = 5) {
    try {
        await pool.query("SELECT 1");
        console.log("Connection established on", process.env.DB_DATABASE);
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
