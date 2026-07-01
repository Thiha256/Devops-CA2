const db = require("../database");

// Fetch a single user by their email (used for login).
async function getUserByEmail(email) {
    const [rows] = await db.execute(
        `SELECT user_id, name, email, password_hash, role
         FROM users
         WHERE email = ?`,
        [email]
    );
    return rows[0] || null;
}

module.exports = { getUserByEmail };
