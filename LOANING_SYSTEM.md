# Loaning System — File Guide

This document lists every file involved in the **laptop loaning system** and what
each one does. Nothing here changes the code — it's just a map.

The flow it covers:

```
Student browses laptops  ->  sends a loan request  ->  admin approves/rejects
      ->  laptop goes on loan  ->  admin returns it and sets its status
```

---

## 1. The request→approval→return flow (step by step)

| Step | Who | Action | Route (in `app.js`) | View the button lives on |
|-----|------|--------|---------------------|--------------------------|
| 1 | Student | Send a loan request | `POST /loans/request` | `views/browse.ejs` |
| 2 | Student | See my requests + loans | `GET /loans` | `views/loans.ejs` |
| 3 | Student | Cancel a pending request | `POST /loans/request/:id/cancel` | `views/loans.ejs` |
| 4 | Admin | Review all requests + loans | `GET /admin/loans` | `views/admin/adminLoans.ejs` |
| 5 | Admin | Approve a request → creates loan | `POST /admin/loans/requests/:id/approve` | `views/admin/adminLoans.ejs` |
| 6 | Admin | Reject a request | `POST /admin/loans/requests/:id/reject` | `views/admin/adminLoans.ejs` |
| 7 | Admin | Return laptop + set status | `POST /admin/loans/:id/return` | `views/admin/adminLoans.ejs` (popup) |

All 7 routes live together in the **`LOAN SYSTEM`** section of `app.js`, in this order.

---

## 2. Files needed and what they do

### Core logic

| File | What it does |
|------|--------------|
| **`app.js`** | Wires up the URLs (routes) above to the model functions. Also checks login/role (`requireLogin`, `requireAdmin`) and sends notifications after each action. Contains the `LOAN SYSTEM` section. |
| **`models/loanModel.js`** | All the database work for loans & requests (SQL lives here). See the function list below. |
| **`database.js`** | Creates the single MySQL connection pool that every model uses (`require("../database")`). |

### `models/loanModel.js` — the important functions

| Function | Used in step | What it does |
|----------|-------------|--------------|
| `getAllModels()` | Browse (admin) | List every laptop model. |
| `getModelsForSchool(school)` | Browse (student) | List models available to the student's school. |
| `LOAN_REASONS` | Browse | The dropdown of allowed reasons for a request. |
| `createLoanRequest(userId, school, modelId, reason, remarks)` | 1 | Inserts a new **pending** `loan_request` row. |
| `getRequestsByUser(userId)` | 2 | The student's own requests. |
| `getLoansByUser(userId)` | 2 | The student's own loans. |
| `cancelRequest(userId, requestId)` | 3 | Marks the student's pending request cancelled. |
| `getAllRequests()` | 4 | Every request (admin view), with the student name. |
| `getAllLoans()` | 4 | Every loan (admin view), with the student name + overdue info. |
| `approveRequest(requestId, adminId)` | 5 | Turns a pending request into an **active loan** and marks a laptop `on loan`. |
| `rejectRequest(requestId, adminId)` | 6 | Marks a pending request rejected. |
| `returnLoan(loanId, status, reason)` | 7 | Ends a loan (sets `return_date`), sets the laptop's new **status** (`available`/`maintenance`) + reason, and raises a late-return **fine** if overdue. |

### Views (the pages / buttons)

| File | What it shows |
|------|---------------|
| **`views/browse.ejs`** | The laptop catalogue. Each model has the "Request Loan" form → posts to `POST /loans/request` (step 1). |
| **`views/loans.ejs`** | The student's "My Loans" page: their requests (with Cancel) and their active laptops (steps 2–3). |
| **`views/admin/adminLoans.ejs`** | The admin page: pending requests (Approve/Reject) and active loans (Return). The Return button opens a **popup** where the admin picks status + reason (steps 4–7). |
| `views/partials/sidebar.ejs` / `navbar.ejs` | Student navigation — the "My Loans" link and the notification bell. |
| `views/admin/partials/adminSidebar.ejs` / `adminNavbar.ejs` | Admin navigation — the "Active Loans" link. |

### Supporting files (used by the flow, but shared)

| File | Why the loan flow needs it |
|------|----------------------------|
| **`models/userModel.js`** | `getUserByEmail()` — used at login so the app knows who the student is (id, school, role). |
| **`models/laptopModel.js`** | Laptop-model inventory (admin adds/edits models that can be loaned). |
| **`models/assetModel.js`** | The physical laptop units (`laptop` rows) that actually get loaned out. |
| **`models/notificationModel.js`** | Saves the in-app notifications created on request/approve/reject/return. |
| **`lib/notify.js`** | `notifyUser()` — one call that both saves an in-app notification **and** triggers the email. |
| **`lib/n8n.js`** | Sends the webhook to n8n, which sends the actual Gmail email. |
| **`views/notifications.ejs`** | The page the notification bell links to. |

### Database

| File | What it does |
|------|--------------|
| **`sql/setup_db_v3.sql`** | Creates the whole schema and seed data. The loan-related tables are: `user`, `school`, `laptop_model`, `laptop`, `loan`, `loan_request`, `fine`, `school_has_laptop_model`, `notification`. Passwords are stored as bcrypt hashes. **This is the correct schema file to import** (not `setup_db.sql`, which is an older, incompatible version). |

---

## 3. Database tables the loan flow touches

| Table | Role in loaning |
|-------|-----------------|
| `loan_request` | A student's request. `status` = pending → approved / rejected / cancelled. |
| `loan` | An active/finished loan. Created on approval; `return_date` set on return. |
| `laptop` | A physical unit. `status` = available / on loan / maintenance (+ `maint_reason`). |
| `laptop_model` | The model info (brand, cpu, ram…) shown when browsing. |
| `user` / `school` | Who requested, and which school they belong to (controls what they can borrow). |
| `fine` | A late-return fine, raised automatically on an overdue return. |
| `notification` | In-app messages shown by the navbar bell. |

---

## 4. One-line summary of the flow in code

1. **Browse** (`browse.ejs`) → student submits → **`POST /loans/request`** → `loanModel.createLoanRequest()` → row in `loan_request` (pending).
2. Student sees it on **`/loans`** (`loans.ejs`) via `getRequestsByUser()`.
3. Admin opens **`/admin/loans`** (`adminLoans.ejs`) → `getAllRequests()` + `getAllLoans()`.
4. Admin **approves** → `approveRequest()` → new `loan` row + laptop set `on loan`.
5. When returned, admin clicks **Return** → popup → **`POST /admin/loans/:id/return`** → `returnLoan()` sets `return_date`, laptop status + reason, and any fine.
6. Each step calls `notifyUser()` so the student gets a bell notification + email.
