const LOAN_REASONS = {
    financial: "Financial reasons",
    maintenance: "Own laptop under maintenance"
};

const laptopModels = [
    { model_id: 1, name: "Lenovo ThinkPad X13", specs: "Intel i5, 16GB RAM, 512GB SSD", icon: "fa-laptop", total_stock: 4, schools: ["SOI", "SEG"] },
    { model_id: 2, name: "Dell Latitude 5440",  specs: "Intel i7, 16GB RAM, 512GB SSD", icon: "fa-laptop", total_stock: 3, schools: ["SOI", "SEG", "SAS"] },
    { model_id: 3, name: "HP EliteBook 840",    specs: "Intel i5, 8GB RAM, 256GB SSD",  icon: "fa-laptop", total_stock: 5, schools: ["SBM", "SOH", "SAS"] },
    { model_id: 4, name: "MacBook Air M2",      specs: "Apple M2, 8GB RAM, 256GB SSD",  icon: "fa-laptop", total_stock: 2, schools: ["STA"] },
    { model_id: 5, name: "Acer TravelMate P2",  specs: "Intel i3, 8GB RAM, 256GB SSD",  icon: "fa-laptop", total_stock: 6, schools: ["SBM", "SOH", "STA", "SAS", "SOI", "SEG"] }
];

let loanRequests = [];
let nextRequestId = 1;

let loans = [];
let nextLoanId = 1;

function getModelById(modelId) {
    return laptopModels.find(m => m.model_id === Number(modelId)) || null;
}

function activeLoanCount(modelId) {
    return loans.filter(l => l.model_id === modelId && l.status === "active").length;
}

function availableStock(modelId) {
    const model = getModelById(modelId);
    if (!model) return 0;
    return model.total_stock - activeLoanCount(modelId);
}

function pendingRequestCount(modelId) {
    return loanRequests.filter(r => r.model_id === modelId && r.status === "pending").length;
}

function formatDate(d) {
    return d.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

function getModelsForSchool(school) {
    return laptopModels
        .filter(m => m.schools.includes(school))
        .map(m => ({
            ...m,
            available: availableStock(m.model_id),
            pending: pendingRequestCount(m.model_id)
        }));
}

function getAllModels() {
    return laptopModels.map(m => ({
        ...m,
        available: availableStock(m.model_id),
        pending: pendingRequestCount(m.model_id)
    }));
}

function createLoanRequest(userId, school, modelId, reason, remarks, startDate) {
    const model = getModelById(modelId);

    if (!model) return { ok: false, error: "That laptop model does not exist." };

    if (!model.schools.includes(school)) {
        return { ok: false, error: "This model is not available to your school." };
    }

    if (!LOAN_REASONS[reason]) {
        return { ok: false, error: "Please select a valid reason for your loan." };
    }
    if (!remarks || !remarks.trim()) {
        return { ok: false, error: "Please fill in the remarks explaining your reason." };
    }

    const parsedStart = new Date(startDate + "T00:00:00");
    if (!startDate || isNaN(parsedStart.getTime())) {
        return { ok: false, error: "Please choose a start date for your loan." };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedStart < today) {
        return { ok: false, error: "The start date cannot be in the past." };
    }

    const duplicate = loanRequests.find(r =>
        r.user_id === userId && r.model_id === model.model_id && r.status === "pending");
    if (duplicate) {
        return { ok: false, error: "You already have a pending request for this model." };
    }

    const alreadyLoaned = loans.find(l =>
        l.user_id === userId && l.model_id === model.model_id && l.status === "active");
    if (alreadyLoaned) {
        return { ok: false, error: "You already have this model on loan." };
    }

    loanRequests.push({
        request_id: nextRequestId++,
        user_id: userId,
        model_id: model.model_id,
        reason,
        remarks: remarks.trim(),
        start_date: parsedStart,
        status: "pending",
        created_at: new Date()
    });

    return { ok: true };
}

function getRequestsByUser(userId) {
    return loanRequests
        .filter(r => r.user_id === userId)
        .sort((a, b) => b.created_at - a.created_at)
        .map(r => ({
            ...r,
            modelName: getModelById(r.model_id)?.name || "Unknown model",
            reasonLabel: LOAN_REASONS[r.reason] || r.reason,
            dateLabel: formatDate(r.created_at),
            startLabel: formatDate(r.start_date)
        }));
}

function cancelRequest(userId, requestId) {
    const req = loanRequests.find(r =>
        r.request_id === Number(requestId) && r.user_id === userId);
    if (!req) return { ok: false, error: "Request not found." };
    if (req.status !== "pending") {
        return { ok: false, error: "Only pending requests can be cancelled." };
    }
    loanRequests = loanRequests.filter(r => r !== req);
    return { ok: true };
}

function getLoansByUser(userId) {
    const now = new Date();
    return loans
        .filter(l => l.user_id === userId)
        .sort((a, b) => b.borrow_date - a.borrow_date)
        .map(l => {
            const daysRemaining = Math.ceil((l.due_date - now) / (1000 * 60 * 60 * 24));
            return {
                ...l,
                modelName: getModelById(l.model_id)?.name || "Unknown model",
                borrowLabel: formatDate(l.borrow_date),
                dueLabel: formatDate(l.due_date),
                daysRemaining,
                overdue: l.status === "active" && daysRemaining < 0
            };
        });
}

function returnLoan(userId, loanId) {
    const loan = loans.find(l =>
        l.loan_id === Number(loanId) && l.user_id === userId);
    if (!loan) return { ok: false, error: "Loan not found." };
    if (loan.status !== "active") {
        return { ok: false, error: "This loan has already been returned." };
    }
    loan.status = "returned";
    loan.returned_at = new Date();
    return { ok: true };
}

function approveRequest(requestId) {
    const req = loanRequests.find(r => r.request_id === Number(requestId));
    if (!req || req.status !== "pending") {
        return { ok: false, error: "Request not found or not pending." };
    }
    if (availableStock(req.model_id) <= 0) {
        return { ok: false, error: "No stock available for this model." };
    }

    req.status = "approved";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const borrowDate = req.start_date > today ? new Date(req.start_date) : today;
    const dueDate = new Date(borrowDate);
    dueDate.setMonth(dueDate.getMonth() + 1);

    loans.push({
        loan_id: nextLoanId++,
        user_id: req.user_id,
        model_id: req.model_id,
        borrow_date: borrowDate,
        due_date: dueDate,
        status: "active"
    });

    return { ok: true };
}

function rejectRequest(requestId) {
    const req = loanRequests.find(r => r.request_id === Number(requestId));
    if (!req || req.status !== "pending") {
        return { ok: false, error: "Request not found or not pending." };
    }
    req.status = "rejected";
    return { ok: true };
}

module.exports = {
    LOAN_REASONS,
    getModelsForSchool,
    getAllModels,
    createLoanRequest,
    getRequestsByUser,
    cancelRequest,
    getLoansByUser,
    returnLoan,
    approveRequest,
    rejectRequest
};