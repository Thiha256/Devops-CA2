/* ============================================================
   RP Resource Centre — shared UI helpers
   ------------------------------------------------------------
   Two small pieces, used across every page:

   1. RP.toast(message, type)
      Shows a small auto-dismissing notification (Bootstrap Toast)
      instead of a full-width banner that sits on the page forever.

   2. RP.confirm(message, options)
      Shows a branded confirmation dialog (Bootstrap Modal) and
      returns a Promise<boolean> — replaces window.confirm().

   Also auto-wires two things on every page load:
   - Any element with [data-flash] on the page is shown as a toast
     (the server renders these as hidden markers; see partials).
   - Any <form class="rp-confirm-form" data-confirm-message="..."> is
     intercepted so its submit button asks via RP.confirm() first,
     instead of the native browser confirm() popup.
   ============================================================ */

(function () {
    var RP = window.RP || {};

    function ensureToastContainer() {
        var c = document.getElementById("rp-toast-container");
        if (!c) {
            c = document.createElement("div");
            c.id = "rp-toast-container";
            c.className = "toast-container position-fixed top-0 end-0 p-3";
            c.style.zIndex = 1080;
            document.body.appendChild(c);
        }
        return c;
    }

    // type: "success" (default) or "danger"
    RP.toast = function (message, type) {
        type = type === "danger" ? "danger" : "success";
        var icon = type === "danger" ? "fa-circle-exclamation" : "fa-circle-check";

        var container = ensureToastContainer();
        var el = document.createElement("div");
        el.className = "toast rp-toast rp-toast-" + type + " border-0";
        el.setAttribute("role", "alert");
        el.setAttribute("aria-live", "assertive");
        el.setAttribute("aria-atomic", "true");

        var body = document.createElement("div");
        body.className = "d-flex";

        var content = document.createElement("div");
        content.className = "toast-body d-flex align-items-center gap-2";

        var iconEl = document.createElement("i");
        iconEl.className = "fa-solid " + icon;

        var textEl = document.createElement("span");
        textEl.textContent = message; // textContent, never innerHTML — no injected markup

        content.appendChild(iconEl);
        content.appendChild(textEl);

        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn-close btn-close-white me-2 m-auto";
        closeBtn.setAttribute("data-bs-dismiss", "toast");
        closeBtn.setAttribute("aria-label", "Close");

        body.appendChild(content);
        body.appendChild(closeBtn);
        el.appendChild(body);
        container.appendChild(el);

        var instance = new bootstrap.Toast(el, { delay: 4500 });
        el.addEventListener("hidden.bs.toast", function () {
            el.remove();
        });
        instance.show();
    };

    // options: { title, confirmLabel, cancelLabel, danger }
    RP.confirm = function (message, options) {
        options = options || {};
        return new Promise(function (resolve) {
            var modalEl = document.createElement("div");
            modalEl.className = "modal fade";
            modalEl.tabIndex = -1;
            modalEl.setAttribute("aria-hidden", "true");

            modalEl.innerHTML =
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content rounded-4 border-0 rp-confirm-modal">' +
                        '<div class="modal-body text-center p-4">' +
                            '<div class="rp-confirm-icon ' + (options.danger === false ? "rp-confirm-icon-neutral" : "rp-confirm-icon-danger") + ' mb-3">' +
                                '<i class="fa-solid ' + (options.danger === false ? "fa-circle-question" : "fa-triangle-exclamation") + '"></i>' +
                            "</div>" +
                            '<h5 class="fw-bold mb-2 rp-confirm-title"></h5>' +
                            '<p class="text-muted mb-4 rp-confirm-message"></p>' +
                            '<div class="d-flex gap-2 justify-content-center">' +
                                '<button type="button" class="btn btn-light rounded-3 px-4 rp-confirm-cancel">' + (options.cancelLabel || "Cancel") + "</button>" +
                                '<button type="button" class="btn ' + (options.danger === false ? "btn-primary" : "btn-danger") + ' rounded-3 px-4 rp-confirm-ok">' + (options.confirmLabel || "Confirm") + "</button>" +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>";

            modalEl.querySelector(".rp-confirm-title").textContent = options.title || "Are you sure?";
            modalEl.querySelector(".rp-confirm-message").textContent = message || "";

            document.body.appendChild(modalEl);
            var instance = new bootstrap.Modal(modalEl);
            var decided = false;

            modalEl.querySelector(".rp-confirm-ok").addEventListener("click", function () {
                decided = true;
                instance.hide();
                resolve(true);
            });

            modalEl.addEventListener("hidden.bs.modal", function () {
                modalEl.remove();
                if (!decided) resolve(false);
            });

            instance.show();
        });
    };

    window.RP = RP;

    document.addEventListener("DOMContentLoaded", function () {
        // 1) Auto-toast any server-rendered flash messages on this page.
        document.querySelectorAll("[data-flash]").forEach(function (el) {
            var type = el.getAttribute("data-flash");
            var message = el.getAttribute("data-flash-message");
            if (message) RP.toast(message, type);
            el.remove();
        });

        // Drop success/error query params from the URL so a refresh
        // doesn't re-trigger the same toast.
        if (window.location.search.match(/[?&](success|error|submitted)=/)) {
            var url = new URL(window.location.href);
            ["success", "error", "submitted"].forEach(function (p) { url.searchParams.delete(p); });
            window.history.replaceState({}, "", url.pathname + url.search);
        }

        // 2) Intercept any confirm-before-submit forms, replacing
        //    window.confirm() with the branded RP.confirm() modal.
        document.querySelectorAll("form.rp-confirm-form").forEach(function (form) {
            form.addEventListener("submit", function (event) {
                if (form.dataset.rpConfirmed === "1") return; // already confirmed, let it through
                event.preventDefault();

                RP.confirm(form.dataset.confirmMessage || "Are you sure?", {
                    title: form.dataset.confirmTitle,
                    confirmLabel: form.dataset.confirmLabel
                }).then(function (ok) {
                    if (ok) {
                        form.dataset.rpConfirmed = "1";
                        form.submit();
                    }
                });
            });
        });
    });
})();
