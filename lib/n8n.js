// Sends an event payload to the configured n8n webhook, which then delivers
// the email (via n8n's Gmail node). This keeps email-sending OUT of the app:
// the app just announces "this happened", and n8n decides how to notify.
//
// Safe by design: if N8N_WEBHOOK_URL isn't set (e.g. before n8n is wired up)
// or the request fails, it logs and returns instead of throwing — so a
// notification never breaks the user action that triggered it.
async function sendToN8n(payload) {
    const url = process.env.N8N_WEBHOOK_URL;
    if (!url) return;                         // n8n not configured yet
    if (typeof fetch !== "function") return;  // Node < 18 has no global fetch

    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("n8n webhook failed:", err.message);
    }
}

module.exports = { sendToN8n };
