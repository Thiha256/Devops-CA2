const express = require("express");
const path = require("path");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// Sample data
const student = {
    name: "John Tan",
    id: "2401234",
    course: "Diploma in Information Technology"
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

// Routes
app.get("/", (req, res) => {
    res.render("welcom", { title: "Welcome", page: "welcome" });
});

app.get("/home", (req, res) => {
    res.render("index", { title: "RP Resource Centre", page: "dashboard", student, stats, loan });
});

app.get("/browse", (req, res) => {
    res.render("browse", { title: "Browse Devices", page: "browse", student });
});

app.get("/loans", (req, res) => {
    res.render("loans", { title: "My Loans", page: "loans", student });
});

app.get("/penalties", (req, res) => {
    res.render("penalties", { title: "Penalties", page: "penalties", student });
});

app.get("/profile", (req, res) => {
    res.render("profile", { title: "Profile", page: "profile", student });
});

app.get("/support", (req, res) => {
    res.render("support", { title: "Support", page: "support", student });
});

// Start the server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});