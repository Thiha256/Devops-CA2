// Creates the database tables and sample data the first time the app starts
// on a fresh MySQL server (e.g. Railway). If the tables already exist it does
// nothing, so real data is never touched.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const DB = process.env.DB_DATABASE || "resource_centre_db";

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || process.env.MYSQLHOST,
        port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
        user: process.env.DB_USER || process.env.MYSQLUSER,
        password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
        // Cloud MySQL hosts (TiDB Cloud, Aiven...) need DB_SSL=true
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
        multipleStatements: true
    });

    const [rows] = await conn.query(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'user'",
        [DB]
    );
    if (rows[0].n > 0) {
        console.log("init-db: tables already exist, skipping setup");
    } else {
        console.log("init-db: fresh database, running sql/setup_db_v3.sql");
        const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "setup_db_v3.sql"), "utf8")
            // "VISIBLE" is MySQL 8 only and is the default anyway; dropping it
            // lets the same script run on MySQL-compatible hosts like TiDB Cloud
            .replace(/ VISIBLE/g, "");
        await conn.query(sql);
    }

    // Table for logins when sessions are kept in MySQL (used on Vercel)
    await conn.query(
        `CREATE TABLE IF NOT EXISTS \`${DB}\`.sessions (
            session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
            expires INT UNSIGNED NOT NULL,
            data MEDIUMTEXT COLLATE utf8mb4_bin,
            PRIMARY KEY (session_id)
        ) ENGINE=InnoDB`
    );

    // Public demo logins, so visitors can try the app without real accounts.
    // Set DEMO_PASSWORD to turn them on.
    if (process.env.DEMO_PASSWORD) {
        const hash = await bcrypt.hash(process.env.DEMO_PASSWORD, 10);
        await conn.query(
            `INSERT INTO \`${DB}\`.user (user_id, school_id, name, email, password_hash, role) VALUES
             (900, 'SOI', 'Demo Student', 'student@demo.com', ?, 'student'),
             (901, NULL, 'Demo Admin', 'admin@demo.com', ?, 'admin')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
            [hash, hash]
        );
        console.log("init-db: demo logins ready (student@demo.com / admin@demo.com)");
    }
    await conn.end();
}

module.exports = main;

// When run directly (`node scripts/init-db.js`, as the Dockerfile does)
if (require.main === module) {
    main().catch((err) => {
        // Don't block the app from starting; database.js will report connection problems too
        console.error("init-db failed:", err.message);
        process.exit(0);
    });
}
