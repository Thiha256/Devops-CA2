const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");

const { getUserByEmail } = require("./models/userModel");
const { getModelsWithStats, getModelStatsById, deleteModel, getModelById, updateModel, createModel } = require("./models/laptopModel");
const { getAssetsByModel, createAsset, getAssetById, updateAsset, deleteAsset } = require("./models/assetModel");
const loanModel = require("./models/loanModel");
const reportModel = require("./models/reportModel");
const notificationModel = require("./models/notificationModel");
const auditModel = require("./models/auditModel");
const { notifyUser } = require("./lib/notify");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "rp-resource-centre-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }
}));

// On every request, load the logged-in user's notifications so the navbar bell
// (rendered on every page) can show the unread count + dropdown list. Exposed
// via res.locals, which EJS templates read without each route passing them in.
app.use(async (req, res, next) => {
    res.locals.notifications = [];
    res.locals.unreadCount = 0;

    if (req.session.user) {
        try {
            res.locals.notifications = await notificationModel.getRecentByUser(req.session.user.id);
            res.locals.unreadCount = await notificationModel.getUnreadCount(req.session.user.id);
        } catch (err) {
            console.error("Loading notifications failed:", err.message);
        }
    }

    next();
});

// Sample data (fills in profile fields not stored in the DB)
const sampleProfile = {
    course: "Diploma in Information Technology",
    school: "SOI",
    phone: "9123 4567",
    memberSince: "Jan 2025"
};

const stats = {
    available: 125,
    loans: 1,
    penalties: 0,
    dueSoon: 1
};

const loan = {
    device: "Lenovo ThinkPad X13",
    dueDate: "30 June 2026",
    status: "On Loan",
    daysRemaining: 5
};

// Build the `student` object templates expect, from the logged-in session user.
// Any profile edits made via the Edit Profile modal are stored per-session in
// req.session.profile and merged in here. School was fetched once at login and
// cached on req.session.user (admins have no school, so it's null for them).
function currentStudent(req) {
    const u = req.session.user;
    const edits = req.session.profile || {};

    return {
        name: edits.name || u.name,
        id: String(u.id),
        email: edits.email || u.email,
        role: u.role,
        course: edits.course || u.course || sampleProfile.course,
        school: edits.school || u.school || sampleProfile.school,
        phone: edits.phone || sampleProfile.phone,
        memberSince: sampleProfile.memberSince
    };
}

// Redirect to welcome if not logged in; redirect to /home if logged in but wrong role.
function requireRole(role) {
    return function (req, res, next) {
        if (!req.session.user) return res.redirect("/welcome");
        // role is only truthy for requireAdmin (e.g. "admin"), so this only fires when
        // a specific role was required AND the logged-in user's role doesn't match it.
        if (role && req.session.user.role !== role) return res.redirect("/home");
        next();
    };
}

// role is omitted here, so it's undefined inside requireRole -> the role check is skipped
// and this just enforces "logged in", regardless of role.
const requireLogin = requireRole();
const requireAdmin = requireRole("admin");

// ---------- Public / auth routes ----------

app.get("/", (req, res) => {
    res.render("welcome", { title: "Welcome", page: "welcome" });
});

app.get("/welcome", (req, res) => {
    res.render("welcome", { title: "Welcome", page: "welcome" });
});

// Show the login form for a given role ("student" or "admin").
app.get("/login/:role", (req, res) => {
    const role = req.params.role;
    if (role !== "student" && role !== "admin") return res.redirect("/welcome");
    res.render("login", { title: "Log in", page: "login", role, error: null, email: "" });
});

// Handle a login attempt, enforcing that the account's role matches the login page.
app.post("/login/:role", async (req, res) => {
    const role = req.params.role;
    if (role !== "student" && role !== "admin") return res.redirect("/welcome");

    const { email, password } = req.body;
    const render = (error) =>
        res.status(401).render("login", { title: "Log in", page: "login", role, error, email });

    try {
        const user = await getUserByEmail(email);

        // Verify the typed password against the stored bcrypt hash.
        // Same generic message whether the email or password is wrong.
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return render("Invalid email or password.");
        }

        // Role enforcement: an account may only sign in through its own login page.
        if (user.role !== role) {
            const attempted = role === "admin" ? "admin" : "student";
            const actual = user.role === "admin" ? "an admin/staff" : "a student";
            return render(
                `This is the ${attempted} login. Your account is ${actual} account and cannot log in here.`
            );
        }

        req.session.user = {
            id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            school: user.school_name // admins have no school_id so this will be null for them
        };

        // Record the sign-in in the audit trail.
        await auditModel.logAction(user.user_id, "login", "Signed in to the " + user.role + " portal");

        // admins land on the admin inventory page, students land on the dashboard.
        return res.redirect(user.role === "admin" ? "/admin" : "/home");
    } catch (err) {
        console.error("Login error:", err.message);
        return render("Something went wrong. Please try again.");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/welcome"));
});

// ---------- Protected app routes ----------

app.get("/home", requireLogin, async (req, res) => {
    res.render("index", { title: "RP Resource Centre", page: "dashboard", student: currentStudent(req), stats, loan });
});

// Browse loanable laptop models. Admins see every model; students see only the
// models available to their school. Supports a search query via ?q=.
app.get("/browse", requireLogin, async (req, res) => {
    const student = currentStudent(req);
    const query = (req.query.q || "").trim();
    const q = query.toLowerCase();

    let models = student.role === "admin"
        ? await loanModel.getAllModels()
        : await loanModel.getModelsForSchool(student.school);

    if (q) {
        models = models.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.specs.toLowerCase().includes(q)
        );
    }

    res.render("browse", {
        title: "Browse Devices",
        page: "browse",
        student,
        models,
        query,
        reasons: loanModel.LOAN_REASONS,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// ---------- Admin: inventory management ----------

// root admin page
app.get('/admin', requireAdmin, async (req, res) => {
    const q = req.query.query || "";

    const allModels = await getModelsWithStats();
    const filteredModels = q
        ? allModels.filter(model => model.name.toLowerCase().includes(q.toLowerCase()))
        : allModels;

    res.render('admin/adminPage', {
        page: 'inventory',
        admin: req.session.user,
        models: filteredModels,
        query: q,
        error: null
    });
});

// Delete a model. Blocked by the DB's foreign keys if any laptops, school
// assignments, or loan requests still reference it — surface that as an error.
app.post('/admin/inventory/:id/delete', requireAdmin, async (req, res) => {
    try {
        await deleteModel(req.params.id);
        await auditModel.logAction(req.session.user.id, "model_delete", `Deleted laptop model #${req.params.id}`);
        res.redirect('/admin');
    } catch (err) {
        const isReferenced = err.code === 'ER_ROW_IS_REFERENCED_2';
        if (!isReferenced) {
            console.error('Delete model error:', err.message);
        }
        const error = isReferenced
            ? 'Cannot delete this model. It still has laptops, school assignments, or loan requests linked to it.'
            : 'Something went wrong deleting this model.';

        const allModels = await getModelsWithStats();
        res.render('admin/adminPage', {
            page: 'inventory',
            admin: req.session.user,
            models: allModels,
            query: '',
            error
        });
    }
});

// Serve add model form.
app.get('/admin/inventory/new', requireAdmin, (req, res) => {
    res.render('admin/addModelForm', {
        page: 'inventory',
        admin: req.session.user,
        model: {},
        error: null
    });
});

// Process adding model form
app.post('/admin/inventory/new', requireAdmin, async (req, res) => {
    const { brand, model_name, cpu, ram, storage, graphics_type, image_url } = req.body;
    try {
        await createModel(brand, model_name, cpu, ram, storage, graphics_type, image_url);
        await auditModel.logAction(req.session.user.id, "model_add", `Added laptop model — ${brand} ${model_name}`);
        res.redirect('/admin');
    } catch (err) {
        console.error('Create model error:', err.message);
        res.render('admin/addModelForm', {
            page: 'inventory',
            admin: req.session.user,
            model: { brand, model_name, cpu, ram, storage, graphics_type, image_url },
            error: 'Something went wrong adding this model.'
        });
    }
});


// Serve edit model form, pre-filled with that one model's current details.
app.get('/admin/inventory/:id/edit', requireAdmin, async (req, res) => {
    const model = await getModelById(req.params.id);
    // if no model is found, render the adminPage instead
    if (!model) {
        const allModels = await getModelsWithStats();
        return res.render('admin/adminPage', {
            page: 'inventory',
            admin: req.session.user,
            models: allModels,
            query: '',
            error: 'That model could not be found.'
        });
    }
    res.render('admin/editModelForm', {
        page: 'inventory',
        admin: req.session.user,
        model,
        error: null
    });
});

// Process model edit form
app.post('/admin/inventory/:id/edit', requireAdmin, async (req, res) => {
    const { brand, model_name, cpu, ram, storage, graphics_type, image_url } = req.body;
    try {
        await updateModel(req.params.id, brand, model_name, cpu, ram, storage, graphics_type, image_url);
        res.redirect('/admin');
    } catch (err) {
        console.error('Update model error:', err.message);
        const model = await getModelById(req.params.id);
        res.render('admin/editModelForm', {
            page: 'inventory',
            admin: req.session.user,
            model: model || { id: req.params.id, brand, model_name, cpu, ram, storage, graphics_type, image_url },
            error: 'Something went wrong updating this model.'
        });
    }
});

// Per-model asset manager: lists every physical laptop unit for one model,
// with optional serial/asset id search and status filter.
app.get('/admin/inventory/:id', requireAdmin, async (req, res) => {
    const model = await getModelStatsById(req.params.id);
    // Go back to the inventory list with an error instead of rendering this
    // page against an undefined model (eg. bad :id in the URL).
    if (!model) {
        const allModels = await getModelsWithStats();
        return res.render('admin/adminPage', {
            page: 'inventory',
            admin: req.session.user,
            models: allModels,
            query: '',
            error: 'That model could not be found.'
        });
    }

    const query = req.query.q || "";
    const status = req.query.status || "";
    const q = query.toLowerCase();

    const allAssets = await getAssetsByModel(req.params.id);
    const assets = allAssets.filter(asset => {
        const matchesQuery = !query ||
            asset.asset_id.toLowerCase().includes(q) ||
            asset.serial_no.toLowerCase().includes(q);
        const matchesStatus = !status || asset.status === status;
        return matchesQuery && matchesStatus;
    });

    res.render('admin/modelAssets', {
        page: 'inventory',
        admin: req.session.user,
        model,
        assets,
        query,
        status
    });
});


// Delete laptop/asset from a specific model
app.post('/admin/inventory/:id/assets/:laptopId/delete', requireAdmin, async (req, res) => {
    try {
        await deleteAsset(req.params.laptopId);
        await auditModel.logAction(req.session.user.id, "asset_delete", `Deleted asset (laptop #${req.params.laptopId})`);
    } catch (err) {
        console.error('Delete asset error:', err.message);
    }
    res.redirect('/admin/inventory/' + req.params.id);
});

// Add asset form for a specific model
app.get('/admin/inventory/:id/assets/new', requireAdmin, async (req, res) => {
    const model = await getModelStatsById(req.params.id);
    if (!model) {
        const allModels = await getModelsWithStats();
        return res.render('admin/adminPage', {
            page: 'inventory',
            admin: req.session.user,
            models: allModels,
            query: '',
            error: 'That model could not be found.'
        });
    }

    res.render('admin/addAssetForm', {
        page: 'inventory',
        admin: req.session.user,
        model,
        asset_number: '',
        serial_no: '',
        status: 'available',
        maint_reason: '',
        error: null
    });
});


// Process creating new asset for a specific model
app.post('/admin/inventory/:id/assets/new', requireAdmin, async (req, res) => {
    const { asset_number, serial_no, status, maint_reason } = req.body;
    const asset_id = 'LAP' + asset_number.padStart(3, '0');
    try {
        await createAsset(req.params.id, asset_id, serial_no, status, maint_reason);
        await auditModel.logAction(req.session.user.id, "asset_add", `Added asset ${asset_id}`);
        res.redirect('/admin/inventory/' + req.params.id);
    } catch (err) {
        const isDuplicate = err.code === 'ER_DUP_ENTRY';
        if (!isDuplicate) {
            console.error('Create asset error:', err.message);
        }

        const model = await getModelStatsById(req.params.id);
        res.render('admin/addAssetForm', {
            page: 'inventory',
            admin: req.session.user,
            model,
            asset_number,
            serial_no,
            status,
            maint_reason,
            error: isDuplicate
                ? 'That Asset ID or Serial Number is already in use.'
                : 'Something went wrong adding this asset.'
        });
    }
});

// Serve edit asset form, pre-filled with that one asset's current details.
app.get('/admin/inventory/:id/assets/:laptopId/edit', requireAdmin, async (req, res) => {
    const model = await getModelStatsById(req.params.id);
    const asset = model ? await getAssetById(req.params.laptopId) : null;

    if (!model || !asset) {
        const allModels = await getModelsWithStats();
        return res.render('admin/adminPage', {
            page: 'inventory',
            admin: req.session.user,
            models: allModels,
            query: '',
            error: !model ? 'That model could not be found.' : 'That asset could not be found.'
        });
    }

    res.render('admin/editAssetForm', {
        page: 'inventory',
        admin: req.session.user,
        model,
        laptopId: asset.laptop_id,
        asset_number: asset.asset_id.replace(/^LAP0*/, '') || '0',
        serial_no: asset.serial_no,
        status: asset.status,
        maint_reason: asset.maint_reason,
        error: null
    });
});

// Process edit asset form
app.post('/admin/inventory/:id/assets/:laptopId/edit', requireAdmin, async (req, res) => {
    const { asset_number, serial_no, status, maint_reason } = req.body;
    const asset_id = 'LAP' + asset_number.padStart(3, '0');
    try {
        await updateAsset(req.params.laptopId, asset_id, serial_no, status, maint_reason);
        res.redirect('/admin/inventory/' + req.params.id);
    } catch (err) {
        const isDuplicate = err.code === 'ER_DUP_ENTRY';
        if (!isDuplicate) {
            console.error('Update asset error:', err.message);
        }

        const model = await getModelStatsById(req.params.id);
        res.render('admin/editAssetForm', {
            page: 'inventory',
            admin: req.session.user,
            model,
            laptopId: req.params.laptopId,
            asset_number,
            serial_no,
            status,
            maint_reason,
            error: isDuplicate
                ? 'That Asset ID or Serial Number is already in use.'
                : 'Something went wrong updating this asset.'
        });
    }
});

// ---------- Admin: reports ----------

app.get('/admin/reports', requireAdmin, async (req, res) => {
    res.render('admin/adminReport', {
        page: 'reports',
        admin: req.session.user,
        stats: await reportModel.getSummaryStats(),
        topModels: await reportModel.getMostRequestedModels(),
        recentReviews: await reportModel.getRecentReviews(),
        overdueLoans: await reportModel.getOverdueLoans(),
        loansBySchool: await reportModel.getLoansBySchool()
    });
});

app.get('/admin/reports/laptops', requireAdmin, async (req, res) => {
    const allowed = ['available', 'on loan', 'maintenance'];
    const status = allowed.includes(req.query.status) ? req.query.status : null;

    res.render('admin/reportLaptops', {
        page: 'reports',
        admin: req.session.user,
        laptops: await reportModel.getLaptopsByStatus(status),
        status
    });
});

// =====================================================================
//  LOAN SYSTEM  —  the whole flow, in the order it happens
//
//    STEP 1  Student sends a loan request     POST /loans/request
//    STEP 2  Student checks their requests    GET  /loans
//    STEP 3  Student cancels a request        POST /loans/request/:id/cancel
//    STEP 4  Admin reviews everything         GET  /admin/loans
//    STEP 5  Admin approves a request         POST /admin/loans/requests/:id/approve
//    STEP 6  Admin rejects a request          POST /admin/loans/requests/:id/reject
//    STEP 7  Admin returns the laptop         POST /admin/loans/:id/return
//
//  A request starts out "pending". Approving it (step 5) turns it into an
//  active loan. Returning that loan (step 7) frees the laptop and lets the
//  admin set its new status (available / maintenance).
// =====================================================================

// --- STEP 1: student sends a loan request (submitted from the Browse page) ---
app.post("/loans/request", requireLogin, async (req, res) => {
    const student = currentStudent(req);

    if (student.role === "admin") {
        return res.redirect("/browse?error=" + encodeURIComponent(
            "Admins cannot submit loan requests."
        ));
    }

    const { model_id, reason, remarks } = req.body;

    const result = await loanModel.createLoanRequest(
        req.session.user.id,
        student.school,
        model_id,
        reason,
        remarks
    );

    if (!result.ok) {
        return res.redirect("/browse?error=" + encodeURIComponent(result.error));
    }

    // Notify the student their request is in (in-app bell + n8n email).
    await notifyUser({
        userId: req.session.user.id,
        email: student.email,
        name: student.name,
        type: "request_submitted",
        message: `Your loan request for ${result.modelName} has been submitted and is pending admin approval.`
    });

    return res.redirect("/loans?success=" + encodeURIComponent(
        "Loan request submitted! You'll see it as Pending until an admin approves it."
    ));
});

// --- STEP 2: student views their own requests + active loans ---
// (Admins don't have personal loans, so send them to the admin page instead.)
app.get("/loans", requireLogin, async (req, res) => {
    if (req.session.user.role === "admin") return res.redirect("/admin/loans");

    const userId = req.session.user.id;
    const student = currentStudent(req);

    const requests = await loanModel.getRequestsByUser(userId);
    const loans = await loanModel.getLoansByUser(userId);

    res.render("loans", {
        title: "My Loans",
        page: "loans",
        student,
        requests,
        loans,
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// --- STEP 3: student cancels one of their still-pending requests ---
app.post("/loans/request/:id/cancel", requireLogin, async (req, res) => {
    const result = await loanModel.cancelRequest(req.session.user.id, req.params.id);

    const msg = result.ok
        ? "success=" + encodeURIComponent("Request cancelled.")
        : "error=" + encodeURIComponent(result.error);

    res.redirect("/loans?" + msg);
});

// --- Download a PDF loan receipt (only the student's own loan) ---
app.get("/loans/:id/receipt", requireLogin, async (req, res) => {
    // getLoanForReceipt is scoped to user_id, so this returns null (and we bail)
    // if the loan isn't theirs — a student can't download someone else's receipt.
    const loan = await loanModel.getLoanForReceipt(req.params.id, req.session.user.id);
    if (!loan) {
        return res.redirect("/loans?error=" + encodeURIComponent("Loan not found."));
    }

    // Build the PDF in memory with pdfkit and stream it straight to the browser.
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    // Build the download filename from the device model, sanitised to be
    // filesystem-safe (spaces/symbols -> hyphens), e.g. "Lenovo-ThinkPad-T14-receipt.pdf".
    const safeModel = loan.modelName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeModel}-receipt.pdf"`);
    doc.pipe(res);

    const fmt = (d) => d
        ? new Date(d).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })
        : "Not returned yet";
    const loanRef = "RP-LOAN-" + String(loan.loan_id).padStart(3, "0");

    // Header — RP logo (centered) above the title
    try {
        const logoW = 70;
        doc.image(path.join(__dirname, "public", "images", "rp-logo.png"), (doc.page.width - logoW) / 2, 40, { width: logoW });
        doc.y = 120;
    } catch (e) {
        // logo is optional — if the image is missing, just skip it
    }
    doc.fontSize(22).fillColor("#0f7a3d").text("RP Resource Centre", { align: "center" });
    doc.fontSize(13).fillColor("#666666").text("Laptop Loan Receipt", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown();

    doc.fontSize(11).fillColor("#000000");
    doc.text(`Receipt No: ${loanRef}`);
    doc.text(`Generated: ${new Date().toLocaleString("en-SG")}`);
    doc.moveDown();

    // Small helper: bold label + normal value on one line
    const line = (label, value) => {
        doc.font("Helvetica-Bold").text(label, { continued: true });
        doc.font("Helvetica").text("  " + value);
    };

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f7a3d").text("Borrower");
    doc.fontSize(11).fillColor("#000000");
    line("Name:", loan.studentName);
    line("Email:", loan.studentEmail);
    line("School:", loan.schoolName);
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f7a3d").text("Device");
    doc.fontSize(11).fillColor("#000000");
    line("Model:", loan.modelName);
    line("Specs:", loan.specs);
    line("Asset ID:", loan.asset_id);
    line("Serial No:", loan.serial_no);
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f7a3d").text("Loan Period");
    doc.fontSize(11).fillColor("#000000");
    line("Borrow Date:", fmt(loan.borrow_date));
    line("Due Date:", fmt(loan.due_date));
    line("Return Date:", fmt(loan.return_date));

    // Loan status + days, derived from the dates (no extra query)
    let statusText;
    if (loan.return_date) {
        statusText = "Returned";
    } else {
        const dayMs = 1000 * 60 * 60 * 24;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const due = new Date(loan.due_date); due.setHours(0, 0, 0, 0);
        const daysLeft = Math.round((due - today) / dayMs);
        statusText = daysLeft < 0
            ? `Overdue by ${Math.abs(daysLeft)} day(s)`
            : `Active - ${daysLeft} day(s) remaining`;
    }
    line("Status:", statusText);

    // Two default signatures side by side: the borrower (their name) and the
    // Resource Centre. Both pre-filled in an oblique font so they read as signatures.
    doc.moveDown(5);
    const baseY = doc.y;
    const lineLen = 200;
    const leftX = 50;
    const rightX = doc.page.width - 50 - lineLen;

    doc.font("Helvetica-Oblique").fontSize(18).fillColor("#0f7a3d");
    doc.text(loan.studentName, leftX, baseY, { width: lineLen });
    doc.text("RP Resource Centre", rightX, baseY, { width: lineLen });

    const lineY = baseY + 26;
    doc.strokeColor("#000000");
    doc.moveTo(leftX, lineY).lineTo(leftX + lineLen, lineY).stroke();
    doc.moveTo(rightX, lineY).lineTo(rightX + lineLen, lineY).stroke();

    doc.font("Helvetica").fontSize(9).fillColor("#666666");
    doc.text("Borrower signature", leftX, lineY + 5, { width: lineLen });
    doc.text("Authorised by: Resource Centre staff", rightX, lineY + 5, { width: lineLen });

    doc.end();
});

// --- STEP 4: admin sees every pending request + every active loan ---
app.get('/admin/loans', requireAdmin, async (req, res) => {
    const requests = await loanModel.getAllRequests();
    const loans = await loanModel.getAllLoans();

    res.render('admin/adminLoans', {
        page: 'loans',
        admin: req.session.user,
        pendingRequests: requests.filter(r => r.status === 'pending'),
        activeLoans: loans.filter(l => l.status === 'active'),
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// --- STEP 5: admin approves a pending request -> creates the active loan ---
app.post("/admin/loans/requests/:id/approve", requireAdmin, async (req, res) => {
    const result = await loanModel.approveRequest(
        req.params.id, req.session.user.id, req.body.remarks, req.body.start_date, req.body.due_date
    );

    // Notify the student (not the admin) that their request was approved.
    if (result.ok && result.student) {
        await notifyUser({
            userId: result.student.userId,
            email: result.student.email,
            name: result.student.name,
            type: "request_approved",
            message: `Good news! Your loan request for ${result.modelName} has been approved.`
        });
    }

    if (result.ok && result.student) {
        await auditModel.logAction(req.session.user.id, "approve",
            `Approved a loan request — ${result.student.name} · ${result.modelName}`);
    }

    const msg = result.ok
        ? "success=" + encodeURIComponent("Request approved, loan created.")
        : "error=" + encodeURIComponent(result.error);

    res.redirect("/admin/loans?" + msg);
});

// --- STEP 6: admin rejects a pending request ---
app.post("/admin/loans/requests/:id/reject", requireAdmin, async (req, res) => {
    const result = await loanModel.rejectRequest(req.params.id, req.session.user.id, req.body.remarks);

    // Notify the student their request was rejected.
    if (result.ok && result.student) {
        await notifyUser({
            userId: result.student.userId,
            email: result.student.email,
            name: result.student.name,
            type: "request_rejected",
            message: `Your loan request for ${result.modelName} has been rejected. Please contact the Resource Centre for details.`
        });
    }

    if (result.ok && result.student) {
        await auditModel.logAction(req.session.user.id, "reject",
            `Rejected a loan request — ${result.student.name} · ${result.modelName}`);
    }

    const msg = result.ok
        ? "success=" + encodeURIComponent("Request rejected.")
        : "error=" + encodeURIComponent(result.error);

    res.redirect("/admin/loans?" + msg);
});

// --- STEP 7: admin returns the laptop and sets its new status ---
// The loan's owner (the student) is notified, not the admin doing the return.
app.post("/admin/loans/:id/return", requireAdmin, async (req, res) => {
    const { status, reason } = req.body;
    const result = await loanModel.returnLoan(req.params.id, status, reason);

    if (result.ok) {
        // Confirm the return to the student who had the laptop...
        await notifyUser({
            userId: result.userId,
            email: result.email,
            name: result.name,
            type: "loan_returned",
            message: `Your loaned ${result.modelName} has been returned. Thank you!`
        });

        // ...and if it was late, tell them about the fine that was raised.
        if (result.fine) {
            await notifyUser({
                userId: result.userId,
                email: result.email,
                name: result.name,
                type: "fine_issued",
                message: `A late-return fine of $${result.fine.amount} was issued for returning ${result.modelName} ${result.fine.daysLate} day(s) late.`
            });
        }

        await auditModel.logAction(req.session.user.id, "return", `Processed a return — ${result.modelName}`);
    }

    const msg = result.ok
        ? "success=" + encodeURIComponent(
            result.status === "maintenance"
                ? `Laptop returned and sent to maintenance.`
                : `Laptop returned and marked available.`
          )
        : "error=" + encodeURIComponent(result.error);

    res.redirect("/admin/loans?" + msg);
});

// ---------- Notifications ----------

// The bell links here. Show the user's notifications, then mark them all read
// so the unread badge clears. The list itself comes from res.locals, but we
// re-query with a higher limit so the full page shows more than the dropdown.
app.get("/notifications", requireLogin, async (req, res) => {
    const notifications = await notificationModel.getRecentByUser(req.session.user.id, 50);
    await notificationModel.markAllRead(req.session.user.id);
    res.locals.unreadCount = 0; // reflect the "read" state on this same render

    res.render("notifications", {
        title: "Notifications",
        page: "notifications",
        student: currentStudent(req),
        notifications
    });
});

// Delete one of the logged-in user's own notifications.
app.post("/notifications/:id/delete", requireLogin, async (req, res) => {
    await notificationModel.deleteNotification(req.params.id, req.session.user.id);
    res.redirect("/notifications");
});

// Clear all of the logged-in user's notifications at once.
app.post("/notifications/clear", requireLogin, async (req, res) => {
    await notificationModel.deleteAllByUser(req.session.user.id);
    res.redirect("/notifications");
});

// Endpoint the scheduled n8n workflow calls (daily). It creates in-app
// reminders for loans due soon / overdue and returns the list so n8n can
// email each borrower. Protected by a shared secret in CRON_SECRET so it
// can't be triggered by just anyone.
app.get("/api/notifications/run-reminders", async (req, res) => {
    const token = req.query.token || req.get("x-cron-token");
    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const dueSoonDays = Number(process.env.DUE_SOON_DAYS) || 2;
    const candidates = await loanModel.getReminderCandidates(dueSoonDays);

    // createNotificationOnce dedupes, so running the cron repeatedly in a day
    // won't spam. Only freshly-created reminders are returned for emailing.
    const sent = [];
    for (const c of candidates) {
        const created = await notificationModel.createNotificationOnce(c.userId, c.type, c.message);
        if (created) {
            sent.push({ email: c.email, name: c.name, type: c.type, message: c.message });
        }
    }

    res.json({ count: sent.length, notifications: sent });
});

app.get("/profile", requireLogin, async (req, res) => {
    res.render("profile", { title: "Profile", page: "profile", student: currentStudent(req), stats, loan });
});

app.post("/profile", requireLogin, (req, res) => {
    const { name, school, course, email, phone } = req.body;

    req.session.profile = {
        ...(req.session.profile || {}),
        ...(name ? { name: name.trim() } : {}),
        ...(school ? { school: school.trim() } : {}),
        ...(course ? { course: course.trim() } : {}),
        ...(email ? { email: email.trim() } : {}),
        ...(phone ? { phone: phone.trim() } : {})
    };

    console.log(`Profile updated for ${req.session.user.id}:`, req.session.profile);
    res.redirect("/profile");
});

app.get("/support", requireLogin, async (req, res) => {
    res.render("support", {
        title: "Support",
        page: "support",
        student: currentStudent(req),
        submitted: req.query.submitted === "true"
    });
});

app.post("/support", requireLogin, async (req, res) => {
    const student = currentStudent(req);
    const { subject, message } = req.body;

    console.log(`Support request received from ${student.name} (${student.id}): ${subject} - ${message}`);
    res.redirect("/support?submitted=true");
});

app.get("/admin/profile", requireAdmin, async (req, res) => {
    // ?filter=logins|decisions|inventory narrows the log to those action types.
    const validFilters = ["logins", "decisions", "inventory"];
    const filter = validFilters.includes(req.query.filter) ? req.query.filter : "all";

    const activity = await auditModel.getByUser(
        req.session.user.id,
        filter === "all" ? null : filter
    );

    res.render("admin/adminProfile", {
        page: "profile",
        admin: req.session.user,
        activity,
        filter
    });
});
const PORT = 3001;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
