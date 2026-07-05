const db = require("../database");

async function getUserByEmail(email) {
    const [rows] = await db.execute(`
        SELECT
            u.user_id,
            u.school_id,
            u.name,
            u.email,
            u.password_hash,
            u.role,
            s.school_name
        FROM \`user\` u
        LEFT JOIN school s ON u.school_id = s.school_id
        WHERE u.email = ?
        LIMIT 1
    `, [email]);

    return rows[0] || null;
}

module.exports = {
    getUserByEmail
};