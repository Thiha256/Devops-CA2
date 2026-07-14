// =====================================================================
// Devops-CA2 — Notification service — Implemented by: Lin Htut Win
// =====================================================================
const notificationModel = require("../models/notificationModel");
const { sendToN8n } = require("./n8n");

async function notifyUser({ userId, email, name, type, message }) {
    try {
        await notificationModel.createNotification(userId, type, message);
    } catch (err) {
        console.error("In-app notification failed:", err.message);
    }

    await sendToN8n({ email, name, type, message });
}

module.exports = { notifyUser };
