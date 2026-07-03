const db = require("../database");

// Fetch a single user by their email (used for login).
async function getUserByEmail(email) {
    const [rows] = await db.execute(`
        SELECT user_id, name, email, password_hash, role
        FROM user
        WHERE email = ?`,
        [email]
    );
    return rows[0] || null;
}


async function getStudentSchool(studentId){
    const [rows] = await db.execute(`
        SELECT school_name
        FROM school 
        INNER JOIN user ON school.school_id = user.school_id
        WHERE user.user_id = ?`,
        [studentId]
    );
    return rows[0] || null;
}

module.exports = { getUserByEmail, getStudentSchool };
