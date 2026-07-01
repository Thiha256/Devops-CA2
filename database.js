require("dotenv").config();

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
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
