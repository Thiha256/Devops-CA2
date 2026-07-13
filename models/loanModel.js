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

async function getAllModels() {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            CONCAT(lm.cpu, ', ', lm.ram, 'GB RAM, ', lm.storage, 'GB SSD') AS specs,
            'fa-laptop' AS icon,
            lm.image_url,
            COALESCE((
                SELECT COUNT(*)
                FROM laptop l
                WHERE l.model_id = lm.model_id
                AND l.status = 'available'
            ), 0) AS available,
            COALESCE((
                SELECT COUNT(*)
                FROM loan_request lr
                WHERE lr.model_id = lm.model_id
                AND lr.status = 'pending'
            ), 0) AS pending,
            GROUP_CONCAT(DISTINCT s.school_name ORDER BY s.school_name SEPARATOR ', ') AS schoolsText
        FROM laptop_model lm
        LEFT JOIN school_has_laptop_model shlm ON shlm.model_id = lm.model_id
        LEFT JOIN school s ON s.school_id = shlm.school_id
        GROUP BY lm.model_id, lm.brand, lm.model_name, lm.cpu, lm.ram, lm.storage, lm.image_url
        ORDER BY lm.brand, lm.model_name
    `);

    return rows.map(row => ({
        ...row,
        schools: row.schoolsText ? row.schoolsText.split(", ") : []
    }));
}

async function getModelsForSchool(schoolName) {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            CONCAT(lm.cpu, ', ', lm.ram, 'GB RAM, ', lm.storage, 'GB SSD') AS specs,
            'fa-laptop' AS icon,
            lm.image_url,
            COALESCE((
                SELECT COUNT(*)
                FROM laptop l
                WHERE l.model_id = lm.model_id
                AND l.status = 'available'
            ), 0) AS available,
            COALESCE((
                SELECT COUNT(*)
                FROM loan_request lr
                WHERE lr.model_id = lm.model_id
                AND lr.status = 'pending'
            ), 0) AS pending,
            GROUP_CONCAT(DISTINCT s2.school_name ORDER BY s2.school_name SEPARATOR ', ') AS schoolsText
        FROM laptop_model lm
        JOIN school_has_laptop_model allowed ON allowed.model_id = lm.model_id
        JOIN school sAllowed ON sAllowed.school_id = allowed.school_id
        LEFT JOIN school_has_laptop_model shlm ON shlm.model_id = lm.model_id
        LEFT JOIN school s2 ON s2.school_id = shlm.school_id
        WHERE sAllowed.school_name = ?
        GROUP BY lm.model_id, lm.brand, lm.model_name, lm.cpu, lm.ram, lm.storage, lm.image_url
        ORDER BY lm.brand, lm.model_name
    `, [schoolName]);

    return rows.map(row => ({
        ...row,
        schools: row.schoolsText ? row.schoolsText.split(", ") : []
    }));
}

async function isModelAvailableToSchool(modelId, schoolName) {
    const [rows] = await db.execute(`
        SELECT lm.model_id
        FROM laptop_model lm
        JOIN school_has_laptop_model shlm ON shlm.model_id = lm.model_id
        JOIN school s ON s.school_id = shlm.school_id
        WHERE lm.model_id = ?
        AND s.school_name = ?
    `, [modelId, schoolName]);

    return rows.length > 0;
}

async function createLoanRequest(userId, schoolName, modelId, reason, remarks) {
    if (!LOAN_REASONS[reason]) {
        return { ok: false, error: "Please select a valid reason for your loan." };
    }

    if (!remarks || !remarks.trim()) {
        return { ok: false, error: "Please fill in the remarks explaining your reason." };
    }

    const allowed = await isModelAvailableToSchool(modelId, schoolName);

    if (!allowed) {
        return { ok: false, error: "This laptop model is not available to your school." };
    }

    const [duplicate] = await db.execute(`
        SELECT request_id
        FROM loan_request
        WHERE user_id = ?
        AND model_id = ?
        AND status = 'pending'
    `, [userId, modelId]);

    if (duplicate.length > 0) {
        return { ok: false, error: "You already have a pending request for this model." };
    }

    const [result] = await db.execute(`
        INSERT INTO loan_request
            (user_id, model_id, reason, request_datetime, status, reviewed_by, reviewed_at, remarks)
        VALUES
            (?, ?, ?, NOW(), 'pending', NULL, NULL, ?)
    `, [
        userId,
        Number(modelId),
        reason,
        remarks.trim()
    ]);

    console.log("New loan request inserted into SQL. Request ID:", result.insertId);

    // Return the model's display name so the route can build a notification.
    const [[model]] = await db.execute(`
        SELECT CONCAT(brand, ' ', model_name) AS modelName
        FROM laptop_model
        WHERE model_id = ?
    `, [modelId]);

    return { ok: true, modelName: model ? model.modelName : "your device" };
}

async function getRequestsByUser(userId) {
    const [rows] = await db.execute(`
        SELECT
            lr.request_id,
            lr.user_id,
            lr.model_id,
            lr.reason,
            lr.remarks,
            lr.request_datetime,
            lr.status,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName
        FROM loan_request lr
        JOIN laptop_model lm ON lm.model_id = lr.model_id
        WHERE lr.user_id = ?
        ORDER BY lr.request_id DESC
    `, [userId]);

    return rows.map(r => ({
        ...r,
        reasonLabel: LOAN_REASONS[r.reason] || r.reason,
        dateLabel: formatDate(r.request_datetime),
        startLabel: formatDate(r.request_datetime)
    }));
}

async function getAllRequests() {
    const [rows] = await db.execute(`
        SELECT
            lr.request_id,
            lr.user_id,
            lr.model_id,
            lr.reason,
            lr.remarks,
            lr.request_datetime,
            lr.status,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName,
            u.name AS studentName
        FROM loan_request lr
        JOIN laptop_model lm ON lm.model_id = lr.model_id
        JOIN user u ON u.user_id = lr.user_id
        ORDER BY lr.request_id DESC
    `);

    return rows.map(r => ({
        ...r,
        reasonLabel: LOAN_REASONS[r.reason] || r.reason,
        dateLabel: formatDate(r.request_datetime),
        startLabel: formatDate(r.request_datetime)
    }));
}

async function cancelRequest(userId, requestId) {
    const [rows] = await db.execute(`
        SELECT request_id
        FROM loan_request
        WHERE request_id = ?
        AND user_id = ?
        AND status = 'pending'
    `, [requestId, userId]);

    if (rows.length === 0) {
        return { ok: false, error: "Request not found or cannot be cancelled." };
    }

    await db.execute(`
        DELETE FROM loan_request
        WHERE request_id = ?
        AND user_id = ?
        AND status = 'pending'
    `, [requestId, userId]);

    return { ok: true };
}

async function getLoansByUser(userId) {
    const [rows] = await db.execute(`
        SELECT
            lo.loan_id,
            lo.user_id,
            lo.borrow_date,
            lo.due_date,
            lo.return_date,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName
        FROM loan lo
        JOIN laptop l ON l.laptop_id = lo.laptop_id
        JOIN laptop_model lm ON lm.model_id = l.model_id
        WHERE lo.user_id = ?
        ORDER BY lo.loan_id DESC
    `, [userId]);

    return rows.map(l => {
        const now = new Date();
        const due = new Date(l.due_date);
        const daysRemaining = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

        return {
            ...l,
            status: l.return_date ? "returned" : "active",
            borrowLabel: formatDate(l.borrow_date),
            dueLabel: formatDate(l.due_date),
            returnLabel: l.return_date ? formatDate(l.return_date) : null,
            daysRemaining,
            overdue: !l.return_date && daysRemaining < 0
        };
    });
}

async function getAllLoans() {
    const [rows] = await db.execute(`
        SELECT
            lo.loan_id,
            lo.user_id,
            lo.borrow_date,
            lo.due_date,
            lo.return_date,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName,
            u.name AS studentName
        FROM loan lo
        JOIN laptop l ON l.laptop_id = lo.laptop_id
        JOIN laptop_model lm ON lm.model_id = l.model_id
        JOIN user u ON u.user_id = lo.user_id
        ORDER BY lo.loan_id DESC
    `);

    return rows.map(l => {
        const now = new Date();
        const due = new Date(l.due_date);
        const daysRemaining = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

        return {
            ...l,
            status: l.return_date ? "returned" : "active",
            borrowLabel: formatDate(l.borrow_date),
            dueLabel: formatDate(l.due_date),
            returnLabel: l.return_date ? formatDate(l.return_date) : null,
            daysRemaining,
            overdue: !l.return_date && daysRemaining < 0
        };
    });
}

async function approveRequest(requestId, adminId) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [requests] = await connection.execute(`
            SELECT request_id, user_id, model_id, status
            FROM loan_request
            WHERE request_id = ?
            FOR UPDATE
        `, [requestId]);

        if (requests.length === 0 || requests[0].status !== "pending") {
            await connection.rollback();
            return { ok: false, error: "Request not found or not pending." };
        }

        const request = requests[0];

        const [laptops] = await connection.execute(`
            SELECT laptop_id
            FROM laptop
            WHERE model_id = ?
            AND status = 'available'
            LIMIT 1
            FOR UPDATE
        `, [request.model_id]);

        if (laptops.length === 0) {
            await connection.rollback();
            return { ok: false, error: "No stock available for this model." };
        }

        const laptopId = laptops[0].laptop_id;

        await connection.execute(`
            UPDATE loan_request
            SET status = 'approved',
                reviewed_by = ?,
                reviewed_at = NOW()
            WHERE request_id = ?
        `, [adminId, requestId]);

        await connection.execute(`
            UPDATE laptop
            SET status = 'on loan'
            WHERE laptop_id = ?
        `, [laptopId]);

        await connection.execute(`
            INSERT INTO loan
                (laptop_id, user_id, borrow_date, due_date, return_date)
            VALUES
                (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), NULL)
        `, [laptopId, request.user_id]);

        await connection.commit();

        // After the loan is committed, look up who to notify + which device,
        // so the route can send the "approved" notification/email.
        const [[info]] = await db.execute(`
            SELECT u.name, u.email, CONCAT(lm.brand, ' ', lm.model_name) AS modelName
            FROM user u
            JOIN laptop_model lm ON lm.model_id = ?
            WHERE u.user_id = ?
        `, [request.model_id, request.user_id]);

        return {
            ok: true,
            student: info
                ? { userId: request.user_id, name: info.name, email: info.email }
                : null,
            modelName: info ? info.modelName : "your device"
        };
    } catch (err) {
        await connection.rollback();
        console.error("Approve request error:", err.message);
        return { ok: false, error: "Something went wrong approving the request." };
    } finally {
        connection.release();
    }
}

async function rejectRequest(requestId, adminId) {
    // Look up who made the request (and for which model) before we change it,
    // so the route can notify that student their request was rejected.
    const [[info]] = await db.execute(`
        SELECT lr.user_id, u.name, u.email,
               CONCAT(lm.brand, ' ', lm.model_name) AS modelName
        FROM loan_request lr
        JOIN user u ON u.user_id = lr.user_id
        JOIN laptop_model lm ON lm.model_id = lr.model_id
        WHERE lr.request_id = ?
    `, [requestId]);

    await db.execute(`
        UPDATE loan_request
        SET status = 'rejected',
            reviewed_by = ?,
            reviewed_at = NOW()
        WHERE request_id = ?
        AND status = 'pending'
    `, [adminId, requestId]);

    return {
        ok: true,
        student: info
            ? { userId: info.user_id, name: info.name, email: info.email }
            : null,
        modelName: info ? info.modelName : "your device"
    };
}

async function returnLoan(userId, loanId) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(`
            SELECT loan_id, laptop_id, return_date, due_date
            FROM loan
            WHERE loan_id = ?
            AND user_id = ?
            FOR UPDATE
        `, [loanId, userId]);

        if (rows.length === 0) {
            await connection.rollback();
            return { ok: false, error: "Loan not found." };
        }

        if (rows[0].return_date) {
            await connection.rollback();
            return { ok: false, error: "This loan has already been returned." };
        }

        await connection.execute(`
            UPDATE loan
            SET return_date = CURDATE()
            WHERE loan_id = ?
        `, [loanId]);

        await connection.execute(`
            UPDATE laptop
            SET status = 'available'
            WHERE laptop_id = ?
        `, [rows[0].laptop_id]);

        // Work out if this return is late. return_date was just set to today,
        // so days late = today - due_date (compared at midnight to ignore time).
        const due = new Date(rows[0].due_date);
        const today = new Date();
        const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysLate = Math.round((todayMidnight - dueMidnight) / (1000 * 60 * 60 * 24));

        // If overdue, raise a fine in the SAME transaction so the return and the
        // fine either both commit or both roll back. Rate is $/day from .env.
        let fine = null;
        if (daysLate > 0) {
            const rate = Number(process.env.FINE_RATE_PER_DAY) || 1;
            const amount = daysLate * rate;
            await connection.execute(`
                INSERT INTO fine (loan_id, amount_paid, is_paid, paid_at)
                VALUES (?, ?, 0, NULL)
            `, [loanId, amount]);
            fine = { amount, daysLate };
        }

        await connection.commit();

        // Fetch the device name (outside the transaction) for the notification.
        const [[m]] = await db.execute(`
            SELECT CONCAT(lm.brand, ' ', lm.model_name) AS modelName
            FROM loan lo
            JOIN laptop l ON l.laptop_id = lo.laptop_id
            JOIN laptop_model lm ON lm.model_id = l.model_id
            WHERE lo.loan_id = ?
        `, [loanId]);

        return { ok: true, modelName: m ? m.modelName : "your device", fine };
    } catch (err) {
        await connection.rollback();
        console.error("Return loan error:", err.message);
        return { ok: false, error: "Something went wrong returning the laptop." };
    } finally {
        connection.release();
    }
}

// Active loans (not yet returned) that are overdue OR due within `dueSoonDays`.
// The scheduled n8n workflow hits an endpoint that calls this, then notifies
// each borrower. Returns a ready-to-use type + message per loan.
async function getReminderCandidates(dueSoonDays = 2) {
    const [rows] = await db.execute(`
        SELECT
            lo.loan_id,
            lo.user_id,
            u.name,
            u.email,
            CONCAT(lm.brand, ' ', lm.model_name) AS modelName,
            DATEDIFF(lo.due_date, CURDATE()) AS daysToDue
        FROM loan lo
        JOIN user u ON u.user_id = lo.user_id
        JOIN laptop l ON l.laptop_id = lo.laptop_id
        JOIN laptop_model lm ON lm.model_id = l.model_id
        WHERE lo.return_date IS NULL
          AND DATEDIFF(lo.due_date, CURDATE()) <= ?
        ORDER BY lo.due_date ASC
    `, [dueSoonDays]);

    const rate = Number(process.env.FINE_RATE_PER_DAY) || 1;

    return rows.map(r => {
        const days = Number(r.daysToDue);
        let type, message;

        if (days < 0) {
            const daysOverdue = Math.abs(days);
            const accruedFine = daysOverdue * rate;
            type = "loan_overdue";
            message = `Your loan of ${r.modelName} is ${daysOverdue} day(s) overdue. A late fine of $${accruedFine} has accrued so far (at $${rate}/day) - please return it as soon as possible to stop it increasing.`;
        } else if (days === 0) {
            type = "loan_due_soon";
            message = `Your loan of ${r.modelName} is due today. Please return it on time.`;
        } else {
            type = "loan_due_soon";
            message = `Your loan of ${r.modelName} is due in ${days} day(s). Please return it on time.`;
        }

        return { userId: r.user_id, email: r.email, name: r.name, type, message };
    });
}

module.exports = {
    LOAN_REASONS,
    getAllModels,
    getModelsForSchool,
    createLoanRequest,
    getRequestsByUser,
    getAllRequests,
    cancelRequest,
    getLoansByUser,
    getAllLoans,
    approveRequest,
    rejectRequest,
    returnLoan,
    getReminderCandidates
};