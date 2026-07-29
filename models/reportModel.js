const db = require("../database");

const LOAN_REASONS = {
    financial: "Financial reasons",
    maintenance: "Own laptop under maintenance"
};

function formatDate(d) {
    if (!d) return "-";

    return new Date(d).toLocaleDateString("en-SG", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function formatDateTime(d) {
    if (!d) return "-";

    return new Date(d).toLocaleString("en-SG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

// Pure business logic (no DB access) — builds the last N calendar months,
// ending at the current month, zero-filled with counts from a lookup map.
// Extracted so the month-range/date math can be unit tested directly.
function buildMonthRange(
    months,
    countsByMonth = new Map(),
    referenceDate = new Date()
) {
    const safeMonths = Math.max(
        1,
        Math.min(24, Number.parseInt(months, 10) || 6)
    );

    const result = [];
    const cursor = new Date(referenceDate);

    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - (safeMonths - 1));

    for (let i = 0; i < safeMonths; i++) {
        const yearMonth = cursor.toISOString().slice(0, 7);

        result.push({
            yearMonth,
            label: cursor.toLocaleDateString("en-SG", {
                month: "short",
                year: "numeric"
            }),
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
        WHERE return_date IS NULL
          AND due_date < CURDATE()
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
            (
                SELECT COUNT(*)
                FROM laptop l
                WHERE l.model_id = lm.model_id
            ) AS totalUnits,
            (
                SELECT COUNT(*)
                FROM laptop l
                WHERE l.model_id = lm.model_id
                  AND l.status = 'available'
            ) AS availableUnits
        FROM laptop_model lm
        LEFT JOIN loan_request lr
            ON lr.model_id = lm.model_id
        GROUP BY
            lm.model_id,
            lm.brand,
            lm.model_name
        ORDER BY
            totalRequests DESC,
            name ASC
    `);

    return rows.map(row => ({
        ...row,
        totalRequests: Number(row.totalRequests),
        pendingRequests: Number(row.pendingRequests),
        approvedRequests: Number(row.approvedRequests),
        totalUnits: Number(row.totalUnits),
        availableUnits: Number(row.availableUnits),
        highDemand:
            Number(row.pendingRequests) > Number(row.availableUnits)
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
        JOIN user u
            ON u.user_id = lr.user_id
        LEFT JOIN user reviewer
            ON reviewer.user_id = lr.reviewed_by
        JOIN laptop_model lm
            ON lm.model_id = lr.model_id
        WHERE lr.status IN ('approved', 'rejected')
        ORDER BY
            lr.reviewed_at DESC,
            lr.request_id DESC
        LIMIT 10
    `);

    return rows.map(row => ({
        ...row,
        reasonLabel: LOAN_REASONS[row.reason] || row.reason,
        reviewerName: row.reviewerName || "-",
        reviewedLabel: formatDateTime(row.reviewed_at)
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
        JOIN laptop l
            ON l.laptop_id = lo.laptop_id
        JOIN laptop_model lm
            ON lm.model_id = l.model_id
        JOIN user u
            ON u.user_id = lo.user_id
        WHERE lo.return_date IS NULL
          AND lo.due_date < CURDATE()
        ORDER BY lo.due_date ASC
    `);

    const now = new Date();

    return rows.map(loan => ({
        ...loan,
        dueLabel: formatDate(loan.due_date),
        daysOverdue: Math.ceil(
            (now - new Date(loan.due_date)) /
            (1000 * 60 * 60 * 24)
        )
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
        JOIN user u
            ON u.user_id = lo.user_id
        LEFT JOIN school s
            ON s.school_id = u.school_id
        GROUP BY s.school_name
        ORDER BY totalLoans DESC
    `);

    return rows.map(row => ({
        ...row,
        totalLoans: Number(row.totalLoans),
        activeLoans: Number(row.activeLoans)
    }));
}

// ======================================================
// Most Borrowed Models Report
// ======================================================
async function getMostBorrowedModels(limit = 6) {
    // Ensure LIMIT is always a safe integer.
    // It is inserted directly into the SQL because MySQL prepared
    // statements can reject LIMIT ? in some environments.
    const safeLimit = Math.max(
        1,
        Math.min(20, Number.parseInt(limit, 10) || 6)
    );

    const [rows] = await db.query(`
        SELECT
            lm.model_id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            COUNT(lo.loan_id) AS timesBorrowed
        FROM laptop_model lm
        JOIN laptop l
            ON l.model_id = lm.model_id
        JOIN loan lo
            ON lo.laptop_id = l.laptop_id
        GROUP BY
            lm.model_id,
            lm.brand,
            lm.model_name
        HAVING COUNT(lo.loan_id) > 0
        ORDER BY
            timesBorrowed DESC,
            name ASC
        LIMIT ${safeLimit}
    `);

    return rows.map(row => ({
        ...row,
        timesBorrowed: Number(row.timesBorrowed)
    }));
}

// ======================================================
// Monthly Loan Trends Report
// ======================================================
async function getMonthlyLoanTrends(months = 6) {
    const safeMonths = Math.max(
        1,
        Math.min(24, Number.parseInt(months, 10) || 6)
    );

    // The interval value is safely inserted after conversion to an integer.
    // This avoids prepared-statement issues with INTERVAL ? MONTH.
    const [rows] = await db.query(`
        SELECT
            DATE_FORMAT(borrow_date, '%Y-%m') AS yearMonth,
            COUNT(*) AS totalLoans
        FROM loan
        WHERE borrow_date >= DATE_SUB(
            CURDATE(),
            INTERVAL ${safeMonths - 1} MONTH
        )
        GROUP BY yearMonth
        ORDER BY yearMonth ASC
    `);

    const countsByMonth = new Map(
        rows.map(row => [
            row.yearMonth,
            Number(row.totalLoans)
        ])
    );

    return buildMonthRange(safeMonths, countsByMonth);
}

// ======================================================
// All Laptops Report
// ======================================================
async function getLaptopsByStatus(status) {
    const allowedStatuses = [
        "available",
        "on loan",
        "maintenance"
    ];

    const normalizedStatus =
        typeof status === "string"
            ? status.trim().toLowerCase()
            : "";

    const params = [];
    let where = "";

    if (
        normalizedStatus &&
        allowedStatuses.includes(normalizedStatus)
    ) {
        where = "WHERE l.status = ?";
        params.push(normalizedStatus);
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
        JOIN laptop_model lm
            ON lm.model_id = l.model_id
        LEFT JOIN loan lo
            ON lo.laptop_id = l.laptop_id
           AND lo.return_date IS NULL
        LEFT JOIN user u
            ON u.user_id = lo.user_id
        ${where}
        ORDER BY
            lm.brand,
            lm.model_name,
            l.asset_id
    `, params);

    const now = new Date();

    return rows.map(laptop => {
        const daysRemaining = laptop.due_date
            ? Math.ceil(
                (new Date(laptop.due_date) - now) /
                (1000 * 60 * 60 * 24)
            )
            : null;

        return {
            ...laptop,
            borrowerName: laptop.borrowerName || "-",
            dueLabel: formatDate(laptop.due_date),
            overdue:
                laptop.due_date
                    ? daysRemaining < 0
                    : false
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