const notificationModel = require("../models/notificationModel");
const { sendToN8n } = require("./n8n");

// Fans a single event out to BOTH notification channels:
//   1. an in-app notification row  -> drives the navbar bell + Notifications page
//   2. an n8n webhook call         -> n8n sends the Gmail email
//
// Errors are swallowed so that a failure to notify never rolls back or breaks
// the main action (approving a loan, returning a laptop, etc.).
async function notifyUser({ userId, email, name, type, message }) {
    try {
        await notificationModel.createNotification(userId, type, message);
    } catch (err) {
        console.error("In-app notification failed:", err.message);
    }

    await sendToN8n({ email, name, type, message });
}

module.exports = { notifyUser };
