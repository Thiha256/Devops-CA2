const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "127.0.0.1",
    user: "root",
    password: "RP738964$",
    database: "resource_centre_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function checkPool() {
    try {
        await pool.query("SELECT 1");
        console.log("Connection established on resource_centre_db");
    } catch (err) {
        console.error("Failed to connect to DB:", err.message);
    }
}
checkPool();

module.exports = pool;
