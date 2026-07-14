const db = require("../database");

// Insert a new in-app notification for one user. Returns the new row's id.
async function createNotification(userId, type, message) {
    const [result] = await db.execute(
        `INSERT INTO notification (user_id, type, message, is_read, created_at)
         VALUES (?, ?, ?, 0, NOW())`,
        [userId, type, message]
    );
    return result.insertId;
}

// Same as createNotification, but skips insertion if an identical notification
// already exists for this user. The scheduled reminder job calls this so that
// running the n8n cron multiple times a day doesn't create duplicate reminders.
async function createNotificationOnce(userId, type, message) {
    const [existing] = await db.execute(
        `SELECT notification_id FROM notification
         WHERE user_id = ? AND type = ? AND message = ?
         LIMIT 1`,
        [userId, type, message]
    );
    if (existing.length > 0) return null;
    return createNotification(userId, type, message);
}

// Most recent notifications for a user (newest first), for the bell + page.
// LIMIT is interpolated as a validated integer because mysql2's prepared
// statements don't accept a bound parameter in the LIMIT clause.
async function getRecentByUser(userId, limit = 10) {
    const lim = Number.isInteger(limit) && limit > 0 ? limit : 10;
    const [rows] = await db.execute(
        `SELECT notification_id, type, message, is_read, created_at
         FROM notification
         WHERE user_id = ?
         ORDER BY created_at DESC, notification_id DESC
         LIMIT ${lim}`,
        [userId]
    );
    return rows;
}

// How many unread notifications the user has — drives the red badge count.
async function getUnreadCount(userId) {
    const [[row]] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM notification WHERE user_id = ? AND is_read = 0`,
        [userId]
    );
    return Number(row.cnt);
}

// Mark every unread notification for a user as read (called when they open
// the Notifications page).
async function markAllRead(userId) {
    await db.execute(
        `UPDATE notification SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
        [userId]
    );
}

// Delete one notification. The user_id is checked too, so a user can only ever
// delete their own notifications (they can't guess another user's id and remove it).
async function deleteNotification(notificationId, userId) {
    await db.execute(
        `DELETE FROM notification WHERE notification_id = ? AND user_id = ?`,
        [notificationId, userId]
    );
}

// Delete every notification belonging to one user ("Clear all").
async function deleteAllByUser(userId) {
    await db.execute(`DELETE FROM notification WHERE user_id = ?`, [userId]);
}

module.exports = {
    createNotification,
    createNotificationOnce,
    getRecentByUser,
    getUnreadCount,
    markAllRead,
    deleteNotification,
    deleteAllByUser
};
