// =====================================================================
// Devops-CA2 — n8n workflow integration — Implemented by: Lin Htut Win
// =====================================================================

async function sendToN8n(payload) {
    const url = process.env.N8N_WEBHOOK_URL;
    if (!url) return;                      
    if (typeof fetch !== "function") return;  

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
