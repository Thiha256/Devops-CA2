const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const { getUserByEmail } = require("./models/userModel");
const { getModelsWithStats, getModelStatsById, deleteModel, getModelById, updateModel, createModel } = require("./models/laptopModel");
const { getAssetsByModel } = require("./models/assetModel");

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

// Sample data (fills in profile fields not stored in the DB)
const sampleProfile = {
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
        school: edits.school || u.school,
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
            school: user.school_name //admins have no school_id so this will be null for them
        };

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

// Browse now supports a search query via ?q= — ported from CA2.
app.get("/browse", requireLogin, async (req, res) => {
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

// Add model form. Shares modelForm.ejs with the edit form — an id-less
// model object tells the template to render as "Add" and POST to /new.
app.get('/admin/inventory/new', requireAdmin, (req, res) => {
    res.render('admin/modelForm', {
        page: 'inventory',
        admin: req.session.user,
        model: {},
        error: null
    });
});

app.post('/admin/inventory/new', requireAdmin, async (req, res) => {
    const { brand, model_name, cpu, ram, storage, graphics_type, image_url } = req.body;
    try {
        await createModel({ brand, model_name, cpu, ram, storage, graphics_type, image_url });
        res.redirect('/admin');
    } catch (err) {
        console.error('Create model error:', err.message);
        res.render('admin/modelForm', {
            page: 'inventory',
            admin: req.session.user,
            model: { brand, model_name, cpu, ram, storage, graphics_type, image_url },
            error: 'Something went wrong adding this model.'
        });
    }
});

// Per-model asset manager: lists every physical laptop unit for one model,
// with optional serial/asset id search and status filter.
app.get('/admin/inventory/:id', requireAdmin, async (req, res) => {
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

    const query = req.query.q || "";
    const status = req.query.status || "";

    const allAssets = await getAssetsByModel(req.params.id);
    const assets = allAssets.filter(asset => {
        const matchesQuery = !query ||
            asset.asset_id.toLowerCase().includes(query.toLowerCase()) ||
            asset.serial_no.toLowerCase().includes(query.toLowerCase());
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

// Edit model form, pre-filled with that one model's current details.
app.get('/admin/inventory/:id/edit', requireAdmin, async (req, res) => {
    const model = await getModelById(req.params.id);
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
    res.render('admin/modelForm', {
        page: 'inventory',
        admin: req.session.user,
        model,
        error: null
    });
});

app.post('/admin/inventory/:id/edit', requireAdmin, async (req, res) => {
    const { brand, model_name, cpu, ram, storage, graphics_type, image_url } = req.body;
    try {
        await updateModel(req.params.id, { brand, model_name, cpu, ram, storage, graphics_type, image_url });
        res.redirect('/admin');
    } catch (err) {
        console.error('Update model error:', err.message);
        const model = await getModelById(req.params.id);
        res.render('admin/modelForm', {
            page: 'inventory',
            admin: req.session.user,
            model: model || { id: req.params.id, brand, model_name, cpu, ram, storage, graphics_type, image_url },
            error: 'Something went wrong updating this model.'
        });
    }
});


app.get("/loans", requireLogin, async (req, res) => {
    res.render("loans", { title: "My Loans", page: "loans", student: currentStudent(req) });
});

app.get("/penalties", requireLogin, async (req, res) => {
    res.render("penalties", { title: "Penalties", page: "penalties", student: currentStudent(req) });
});

app.get("/profile", requireLogin, async (req, res) => {
    res.render("profile", { title: "Profile", page: "profile", student: currentStudent(req), stats, loan });
});

// Handle profile edits from the Edit Profile modal — ported from CA2.
// Edits are stored on the session so they persist for the logged-in user.
app.post("/profile", requireLogin, (req, res) => {
    const { name, school, email, phone } = req.body;
    req.session.profile = {
        ...(req.session.profile || {}),
        ...(name ? { name: name.trim() } : {}),
        ...(school ? { school: school.trim() } : {}),
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

// Start the server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});