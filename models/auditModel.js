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

module.exports = { logAction, getByUser, CATEGORIES };
