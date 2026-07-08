const db = require("../database");

const LOAN_REASONS = {
    financial: "Financial reasons",
    maintenance: "Own laptop under maintenance"
};

function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(d) {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

async function getSummaryStats() {
    const [[laptops]] = await db.execute(`
        SELECT
            COUNT(*) AS totalLaptops,
            COALESCE(SUM(status = 'available'), 0) AS availableLaptops,
            COALESCE(SUM(status = 'on loan'), 0) AS onLoanLaptops,
            COALESCE(SUM(status = 'maintenance'), 0) AS maintenanceLaptops
        FROM laptop
    `);

    const [[requests]] = await db.execute(`
        SELECT COUNT(*) AS pendingRequests
        FROM loan_request
        WHERE status = 'pending'
    `);

    const [[overdue]] = await db.execute(`
        SELECT COUNT(*) AS overdueLoans
        FROM loan
        WHERE return_date IS NULL AND due_date < CURDATE()
    `);

    return {
        totalLaptops: Number(laptops.totalLaptops),
        availableLaptops: Number(laptops.availableLaptops),
        onLoanLaptops: Number(laptops.onLoanLaptops),
        maintenanceLaptops: Number(laptops.maintenanceLaptops),
        pendingRequests: Number(requests.pendingRequests),
        overdueLoans: Number(overdue.overdueLoans)
    };
}

async function getMostRequestedModels() {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            COALESCE(COUNT(lr.request_id), 0) AS totalRequests,
            COALESCE(SUM(lr.status = 'pending'), 0) AS pendingRequests,
            COALESCE(SUM(lr.status = 'approved'), 0) AS approvedRequests,
            (SELECT COUNT(*) FROM laptop l
                WHERE l.model_id = lm.model_id) AS totalUnits,
            (SELECT COUNT(*) FROM laptop l
                WHERE l.model_id = lm.model_id AND l.status = 'available') AS availableUnits
        FROM laptop_model lm
        LEFT JOIN loan_request lr ON lr.model_id = lm.model_id
        GROUP BY lm.model_id, lm.brand, lm.model_name
        ORDER BY totalRequests DESC, name ASC
    `);

    return rows.map(r => ({
        ...r,
        totalRequests: Number(r.totalRequests),
        pendingRequests: Number(r.pendingRequests),
        approvedRequests: Number(r.approvedRequests),
        totalUnits: Number(r.totalUnits),
        availableUnits: Number(r.availableUnits),
        highDemand: Number(r.pendingRequests) > Number(r.availableUnits)
    }));
}

async function getRecentReviews() {
    const [rows] = await db.execute(`
        SELECT
            lr.request_id,
            lr.reason,
            lr.status,
            lr.reviewed_at,
            u.name AS studentName,
            reviewer.name AS reviewerName,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName
        FROM loan_request lr
        JOIN user u ON u.user_id = lr.user_id
        LEFT JOIN user reviewer ON reviewer.user_id = lr.reviewed_by
        JOIN laptop_model lm ON lm.model_id = lr.model_id
        WHERE lr.status IN ('approved', 'rejected')
        ORDER BY lr.reviewed_at DESC, lr.request_id DESC
        LIMIT 10
    `);

    return rows.map(r => ({
        ...r,
        reasonLabel: LOAN_REASONS[r.reason] || r.reason,
        reviewerName: r.reviewerName || "-",
        reviewedLabel: formatDateTime(r.reviewed_at)
    }));
}

async function getOverdueLoans() {
    const [rows] = await db.execute(`
        SELECT
            lo.loan_id,
            lo.due_date,
            u.name AS studentName,
            l.asset_id,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName
        FROM loan lo
        JOIN laptop l ON l.laptop_id = lo.laptop_id
        JOIN laptop_model lm ON lm.model_id = l.model_id
        JOIN user u ON u.user_id = lo.user_id
        WHERE lo.return_date IS NULL AND lo.due_date < CURDATE()
        ORDER BY lo.due_date ASC
    `);

    const now = new Date();
    return rows.map(l => ({
        ...l,
        dueLabel: formatDate(l.due_date),
        daysOverdue: Math.ceil((now - new Date(l.due_date)) / (1000 * 60 * 60 * 24))
    }));
}

async function getLoansBySchool() {
    const [rows] = await db.execute(`
        SELECT
            COALESCE(s.school_name, 'Unknown') AS schoolName,
            COUNT(lo.loan_id) AS totalLoans,
            COALESCE(SUM(lo.return_date IS NULL), 0) AS activeLoans
        FROM loan lo
        JOIN user u ON u.user_id = lo.user_id
        LEFT JOIN school s ON s.school_id = u.school_id
        GROUP BY s.school_name
        ORDER BY totalLoans DESC
    `);

    return rows.map(r => ({
        ...r,
        totalLoans: Number(r.totalLoans),
        activeLoans: Number(r.activeLoans)
    }));
}

module.exports = {
    getSummaryStats,
    getMostRequestedModels,
    getRecentReviews,
    getOverdueLoans,
    getLoansBySchool
};