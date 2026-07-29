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

// Pure business logic (no DB access) — builds the last N calendar months,
// ending at the current month, zero-filled with counts from a lookup map.
// Extracted so the month-range/date math can be unit tested directly.
function buildMonthRange(months, countsByMonth = new Map(), referenceDate = new Date()) {
    const result = [];
    const cursor = new Date(referenceDate);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - (months - 1));

    for (let i = 0; i < months; i++) {
        const yearMonth = cursor.toISOString().slice(0, 7);
        result.push({
            yearMonth,
            label: cursor.toLocaleDateString("en-SG", { month: "short", year: "numeric" }),
            totalLoans: countsByMonth.get(yearMonth) || 0
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return result;
}

// ======================================================
// Reports Dashboard
// ======================================================
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

// ======================================================
// Most Requested Models Report
// ======================================================
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

// ======================================================
// Recent Decisions Report
// ======================================================
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

// ======================================================
// Overdue Loans Report
// ======================================================
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

// ======================================================
// Loans by School Report
// ======================================================
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

// ======================================================
// All Laptops Report
// ======================================================
async function getMostBorrowedModels(limit = 6) {
    // Distinct from getMostRequestedModels: this counts actual completed
    // loan records (real borrow events), not pending/approved requests —
    // i.e. "which models do students actually end up borrowing the most".
    const [rows] = await db.execute(`
        SELECT
            lm.model_id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            COUNT(lo.loan_id) AS timesBorrowed
        FROM laptop_model lm
        JOIN laptop l ON l.model_id = lm.model_id
        JOIN loan lo ON lo.laptop_id = l.laptop_id
        GROUP BY lm.model_id, lm.brand, lm.model_name
        HAVING COUNT(lo.loan_id) > 0
        ORDER BY timesBorrowed DESC, name ASC
        LIMIT ?
    `, [limit]);

    return rows.map(r => ({
        ...r,
        timesBorrowed: Number(r.timesBorrowed)
    }));
}

async function getMonthlyLoanTrends(months = 6) {
    // Loan volume per calendar month, for the last N months. Zero-filled
    // (via buildMonthRange) so a month with no loans still shows as 0 on
    // the chart instead of just being skipped.
    const [rows] = await db.execute(`
        SELECT
            DATE_FORMAT(borrow_date, '%Y-%m') AS yearMonth,
            COUNT(*) AS totalLoans
        FROM loan
        WHERE borrow_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        GROUP BY yearMonth
        ORDER BY yearMonth ASC
    `, [months - 1]);

    const countsByMonth = new Map(rows.map(r => [r.yearMonth, Number(r.totalLoans)]));
    return buildMonthRange(months, countsByMonth);
}

async function getLaptopsByStatus(status) {
    const params = [];
    let where = "";

    if (status) {
        where = "WHERE l.status = ?";
        params.push(status);
    }

    const [rows] = await db.execute(`
        SELECT
            l.laptop_id,
            l.asset_id,
            l.serial_no,
            l.status,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName,
            u.name AS borrowerName,
            lo.due_date
        FROM laptop l
        JOIN laptop_model lm ON lm.model_id = l.model_id
        LEFT JOIN loan lo ON lo.laptop_id = l.laptop_id AND lo.return_date IS NULL
        LEFT JOIN user u ON u.user_id = lo.user_id
        ${where}
        ORDER BY lm.brand, lm.model_name, l.asset_id
    `, params);

    const now = new Date();
    return rows.map(l => {
        const daysRemaining = l.due_date
            ? Math.ceil((new Date(l.due_date) - now) / (1000 * 60 * 60 * 24))
            : null;

        return {
            ...l,
            borrowerName: l.borrowerName || "-",
            dueLabel: formatDate(l.due_date),
            overdue: l.due_date ? daysRemaining < 0 : false
        };
    });
}

module.exports = {
    formatDate,
    formatDateTime,
    buildMonthRange,
    getSummaryStats,
    getMostRequestedModels,
    getMostBorrowedModels,
    getMonthlyLoanTrends,
    getRecentReviews,
    getOverdueLoans,
    getLoansBySchool,
    getLaptopsByStatus
};