const express = require("express");
const path = require("path");
const session = require("express-session");

const { getUserByEmail } = require("./models/userModel");
const loanModel = require("./models/loanModel");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "rp-resource-centre-secret",
    resave: false,
    saveUninitialized: false
}));

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

function currentStudent(req) {
    const u = req.session.user;
    const edits = req.session.profile || {};
    return {
        name: edits.name || u.name,
        id: String(u.id),
        email: edits.email || u.email,
        role: u.role,
        course: edits.course || sampleProfile.course,
        school: sampleProfile.school,
        phone: edits.phone || sampleProfile.phone,
        memberSince: sampleProfile.memberSince
    };
}

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/welcome");
    next();
}

app.get("/", (req, res) => {
    res.render("welcome", { title: "Welcome", page: "welcome" });
});

app.get("/welcome", (req, res) => {
    res.render("welcome", { title: "Welcome", page: "welcome" });
});

app.get("/login/:role", (req, res) => {
    const role = req.params.role;
    if (role !== "student" && role !== "admin") return res.redirect("/welcome");
    res.render("login", { title: "Log in", page: "login", role, error: null, email: "" });
});

app.post("/login/:role", async (req, res) => {
    const role = req.params.role;
    if (role !== "student" && role !== "admin") return res.redirect("/welcome");

    const { email, password } = req.body;
    const render = (error) =>
        res.status(401).render("login", { title: "Log in", page: "login", role, error, email });

    try {
        const user = await getUserByEmail(email);

        if (!user || password !== user.password_hash) {
            return render("Invalid email or password.");
        }

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
            role: user.role
        };

        return res.redirect(user.role === "admin" ? "/browse" : "/home");
    } catch (err) {
        console.error("Login error:", err.message);
        return render("Something went wrong. Please try again.");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/welcome"));
});

app.get("/home", requireLogin, (req, res) => {
    res.render("index", { title: "RP Resource Centre", page: "dashboard", student: currentStudent(req), stats, loan });
});

app.get("/browse", requireLogin, (req, res) => {
    const student = currentStudent(req);
    const query = (req.query.q || "").trim();
    const q = query.toLowerCase();

    let models = student.role === "admin"
        ? loanModel.getAllModels()
        : loanModel.getModelsForSchool(student.school);

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

app.post("/loans/request", requireLogin, (req, res) => {
    const student = currentStudent(req);

    if (student.role === "admin") {
        return res.redirect("/browse?error=" + encodeURIComponent(
            "Admins cannot submit loan requests."
        ));
    }

    const { model_id, reason, remarks, start_date } = req.body;

    const result = loanModel.createLoanRequest(
        req.session.user.id, student.school, model_id, reason, remarks, start_date
    );

    if (!result.ok) {
        return res.redirect("/browse?error=" + encodeURIComponent(result.error));
    }
    return res.redirect("/loans?success=" + encodeURIComponent(
        "Loan request submitted! You'll see it as Pending until an admin approves it."
    ));
});

app.get("/loans", requireLogin, (req, res) => {
    const userId = req.session.user.id;
    res.render("loans", {
        title: "My Loans",
        page: "loans",
        student: currentStudent(req),
        requests: loanModel.getRequestsByUser(userId),
        loans: loanModel.getLoansByUser(userId),
        error: req.query.error || null,
        success: req.query.success || null
    });
});

app.post("/loans/request/:id/cancel", requireLogin, (req, res) => {
    const result = loanModel.cancelRequest(req.session.user.id, req.params.id);
    const msg = result.ok
        ? "success=" + encodeURIComponent("Request cancelled.")
        : "error=" + encodeURIComponent(result.error);
    res.redirect("/loans?" + msg);
});

app.post("/loans/:id/return", requireLogin, (req, res) => {
    const result = loanModel.returnLoan(req.session.user.id, req.params.id);
    const msg = result.ok
        ? "success=" + encodeURIComponent("Laptop returned. Thank you!")
        : "error=" + encodeURIComponent(result.error);
    res.redirect("/loans?" + msg);
});

app.post("/dev/requests/:id/approve", requireLogin, (req, res) => {
    if (req.session.user.role !== "admin") {
        return res.redirect("/loans?error=" + encodeURIComponent(
            "Only admins can approve loan requests."
        ));
    }
    const result = loanModel.approveRequest(req.params.id);
    const msg = result.ok
        ? "success=" + encodeURIComponent("Request approved — loan created, due in 1 month.")
        : "error=" + encodeURIComponent(result.error);
    res.redirect("/loans?" + msg);
});

app.get("/penalties", requireLogin, (req, res) => {
    res.render("penalties", { title: "Penalties", page: "penalties", student: currentStudent(req) });
});

app.get("/profile", requireLogin, (req, res) => {
    res.render("profile", { title: "Profile", page: "profile", student: currentStudent(req), stats, loan });
});

app.post("/profile", requireLogin, (req, res) => {
    const { name, course, email, phone } = req.body;
    req.session.profile = {
        ...(req.session.profile || {}),
        ...(name ? { name: name.trim() } : {}),
        ...(course ? { course: course.trim() } : {}),
        ...(email ? { email: email.trim() } : {}),
        ...(phone ? { phone: phone.trim() } : {})
    };
    console.log(`Profile updated for ${req.session.user.id}:`, req.session.profile);
    res.redirect("/profile");
});

app.get("/support", requireLogin, (req, res) => {
    res.render("support", {
        title: "Support",
        page: "support",
        student: currentStudent(req),
        submitted: req.query.submitted === "true"
    });
});

app.post("/support", requireLogin, (req, res) => {
    const student = currentStudent(req);
    const { subject, message } = req.body;
    console.log(`Support request received from ${student.name} (${student.id}): ${subject} - ${message}`);
    res.redirect("/support?submitted=true");
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});