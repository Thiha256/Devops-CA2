const express = require("express");
const path = require("path");
const session = require("express-session");

const { getUserByEmail } = require("./models/userModel");

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

// Sample data (fills in profile fields not stored in the DB)
const sampleProfile = {
    course: "Diploma in Information Technology",
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

// Device catalogue (searchable) — ported from CA2
const devices = [
    { name: "Lenovo ThinkPad X13", specs: "Intel i5, 16GB RAM, 512GB SSD", status: "Available", category: "Laptop", icon: "fa-laptop" },
    { name: "Dell Latitude 5440",  specs: "Intel i7, 16GB RAM, 512GB SSD", status: "Available", category: "Laptop", icon: "fa-laptop" },
    { name: "HP EliteBook 840",    specs: "Intel i5, 8GB RAM, 256GB SSD",  status: "Limited",   category: "Laptop", icon: "fa-laptop" },
    { name: "MacBook Air M2",      specs: "Apple M2, 8GB RAM, 256GB SSD",  status: "Available", category: "Laptop", icon: "fa-laptop" },
    { name: "Canon EOS 200D",      specs: "24MP DSLR, 18-55mm lens",       status: "Available", category: "Camera", icon: "fa-camera" },
    { name: "Logitech C920 Webcam",specs: "1080p HD Webcam",               status: "Limited",   category: "Camera", icon: "fa-video" },
    { name: "USB-C Charger 65W",   specs: "Fast-charging power adapter",   status: "Available", category: "Charger", icon: "fa-plug" },
    { name: "HDMI Cable 2m",       specs: "4K 60Hz HDMI cable",            status: "Available", category: "Accessory", icon: "fa-plug" }
];

// Build the `student` object templates expect, from the logged-in session user.
// Any profile edits made via the Edit Profile modal are stored per-session in
// req.session.profile and merged in here.
function currentStudent(req) {
    const u = req.session.user;
    const edits = req.session.profile || {};
    return {
        name: edits.name || u.name,
        id: String(u.id),
        email: edits.email || u.email,
        role: u.role,
        course: edits.course || sampleProfile.course,
        phone: edits.phone || sampleProfile.phone,
        memberSince: sampleProfile.memberSince
    };
}

// Redirect to welcome if not logged in.
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/welcome");
    next();
}

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

        // Compare the typed password directly against the stored password_hash.
        // Same generic message whether the email or password is wrong.
        if (!user || password !== user.password_hash) {
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
            role: user.role
        };

        // Admins/staff land on Browse Devices; students land on the dashboard.
        return res.redirect(user.role === "admin" ? "/browse" : "/home");
    } catch (err) {
        console.error("Login error:", err.message);
        return render("Something went wrong. Please try again.");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/welcome"));
});

// ---------- Protected app routes ----------

app.get("/home", requireLogin, (req, res) => {
    res.render("index", { title: "RP Resource Centre", page: "dashboard", student: currentStudent(req), stats, loan });
});

// Browse now supports a search query via ?q= — ported from CA2.
app.get("/browse", requireLogin, (req, res) => {
    const query = (req.query.q || "").trim();
    const q = query.toLowerCase();

    // Filter by name, specs or category; empty query shows everything.
    const results = q
        ? devices.filter(d =>
            d.name.toLowerCase().includes(q) ||
            d.specs.toLowerCase().includes(q) ||
            d.category.toLowerCase().includes(q)
          )
        : devices;

    res.render("browse", { title: "Browse Devices", page: "browse", student: currentStudent(req), devices: results, query });
});

app.get("/loans", requireLogin, (req, res) => {
    res.render("loans", { title: "My Loans", page: "loans", student: currentStudent(req) });
});

app.get("/penalties", requireLogin, (req, res) => {
    res.render("penalties", { title: "Penalties", page: "penalties", student: currentStudent(req) });
});

app.get("/profile", requireLogin, (req, res) => {
    res.render("profile", { title: "Profile", page: "profile", student: currentStudent(req), stats, loan });
});

// Handle profile edits from the Edit Profile modal — ported from CA2.
// Edits are stored on the session so they persist for the logged-in user.
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

// Start the server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});