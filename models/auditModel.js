// =====================================================================
// Devops-CA2 — Admin audit log (admin profile) — Implemented by: Lin Htut Win
// =====================================================================
const db = require("../database");

// Which action_types each filter chip on the profile maps to.
const CATEGORIES = {
    logins:    ["login"],
    decisions: ["approve", "reject", "return"],
    inventory: ["model_add", "model_edit", "model_delete", "asset_add", "asset_delete", "asset_edit"]
};

// Record one admin action into the audit_log table. Fire-and-forget: errors are
// swallowed so a logging failure never breaks the action that triggered it.
async function logAction(userId, actionType, description) {
    try {
        await db.execute(
            `INSERT INTO audit_log (user_id, action_type, description, created_at)
             VALUES (?, ?, ?, NOW())`,
            [userId, actionType, description]
        );
    } catch (err) {
        console.error("Audit log failed:", err.message);
    }
}

// Recent log entries for one user, newest first. An optional category filters to
// a set of action_types (see CATEGORIES) via a WHERE ... IN (...) clause. LIMIT
// is interpolated as a validated integer (mysql2 can't bind it as a parameter).
async function getByUser(userId, category, limit = 30) {
    const lim = Number.isInteger(limit) && limit > 0 ? limit : 30;
    const types = CATEGORIES[category];

    if (types) {
        const placeholders = types.map(() => "?").join(", ");
        const [rows] = await db.execute(
            `SELECT log_id, action_type, description, created_at
             FROM audit_log
             WHERE user_id = ? AND action_type IN (${placeholders})
             ORDER BY created_at DESC, log_id DESC
             LIMIT ${lim}`,
            [userId, ...types]
        );
        return rows;
    }

    const [rows] = await db.execute(
        `SELECT log_id, action_type, description, created_at
         FROM audit_log
         WHERE user_id = ?
         ORDER BY created_at DESC, log_id DESC
         LIMIT ${lim}`,
        [userId]
    );
    return rows;
}

// All recent admin actions across every admin (a shared accountability trail),
// newest first. JOINs the user table so each row carries the admin's NAME — this
// is what lets the log show *which* admin did *what*. Only admin-role actors are
// included, so it stays a clean admin audit log. Optional category filter as above.
async function getRecentAll(category, limit = 100) {
    const lim = Number.isInteger(limit) && limit > 0 ? limit : 100;
    const types = CATEGORIES[category];

    const typeClause = types
        ? `AND a.action_type IN (${types.map(() => "?").join(", ")})`
        : "";
    const params = types ? [...types] : [];

    const [rows] = await db.execute(
        `SELECT a.log_id, a.action_type, a.description, a.created_at, u.name AS admin_name
         FROM audit_log a
         JOIN user u ON u.user_id = a.user_id
         WHERE u.role = 'admin' ${typeClause}
         ORDER BY a.created_at DESC, a.log_id DESC
         LIMIT ${lim}`,
        params
    );
    return rows;
}

module.exports = { logAction, getByUser, getRecentAll, CATEGORIES };
