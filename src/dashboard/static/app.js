// Vigil Dashboard — app.js
// SSE handler, countdown timer, tab switching

(function () {
  "use strict";

  // ── Tab Switching ──────────────────────────────
  var TAB_ACTIVE = "text-vigil bg-vigil/10";
  var TAB_INACTIVE = "text-text-muted hover:text-text hover:bg-white/5";

  const tabs = document.querySelectorAll("nav .tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      const target = tab.dataset.tab;

      tabs.forEach(function (t) {
        t.classList.remove("active");
        TAB_ACTIVE.split(" ").forEach(function (c) { t.classList.remove(c); });
        TAB_INACTIVE.split(" ").forEach(function (c) { t.classList.add(c); });
      });
      panels.forEach(function (p) { p.classList.remove("active"); });

      tab.classList.add("active");
      TAB_INACTIVE.split(" ").forEach(function (c) { tab.classList.remove(c); });
      TAB_ACTIVE.split(" ").forEach(function (c) { tab.classList.add(c); });
      var panel = document.getElementById("tab-" + target);
      if (panel) panel.classList.add("active");
    });
  });

  // ── SSE Connection ─────────────────────────────
  var sseStatus = document.getElementById("sse-status");
  var evtSource = null;
  var reconnectDelay = 1000;

  function connectSSE() {
    evtSource = new EventSource("/api/sse");

    evtSource.addEventListener("connected", function () {
      if (sseStatus) sseStatus.textContent = "Connected";
      reconnectDelay = 1000;
    });

    evtSource.addEventListener("tick", function (e) {
      try {
        var data = JSON.parse(e.data);
        resetCountdown(data.nextIn || 30);
      } catch (_) { /* ignore parse errors */ }
    });

    evtSource.addEventListener("message", function (e) {
      var liveIndicator = document.getElementById("tl-live-indicator");
      if (!liveIndicator || !liveIndicator.classList.contains("active")) return;

      // Fetch the rendered HTML fragment for the new message
      try {
        var data = JSON.parse(e.data);
        if (!data.id) return;

        // Fetch the rendered entry card from the server
        fetch("/api/timeline/" + data.id + "/fragment?collapsed=1")
          .then(function (res) { return res.ok ? res.text() : null; })
          .then(function (html) {
            if (!html) return;
            var container = document.getElementById("timeline-entries");
            if (!container) return;

            // Remove empty state if present
            var empty = container.querySelector(".tl-empty");
            if (empty) empty.remove();
            var loading = container.querySelector(".tl-loading");
            if (loading) loading.remove();

            // Prepend new entry
            container.insertAdjacentHTML("afterbegin", html);

            // Re-process HTMX on the new content
            if (window.htmx) htmx.process(container.firstElementChild);
          });
      } catch (_) { /* ignore parse errors */ }
    });

    evtSource.onerror = function () {
      if (sseStatus) sseStatus.textContent = "Disconnected — reconnecting...";
      evtSource.close();
      // Exponential backoff, max 30s
      setTimeout(connectSSE, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };
  }

  connectSSE();

  // ── Countdown Timer ────────────────────────────
  var countdownValue = 30;
  var countdownInterval = null;

  function resetCountdown(seconds) {
    countdownValue = seconds;
    updateCountdownDisplay();
  }

  function updateCountdownDisplay() {
    var el = document.getElementById("countdown");
    if (!el) return;

    // Read server-provided value on first render
    if (el.dataset.next) {
      countdownValue = parseInt(el.dataset.next, 10);
      el.removeAttribute("data-next");
    }

    // Update the text content (keep the SVG icon)
    var svgIcon = el.querySelector("svg");
    var textNode = null;
    for (var i = el.childNodes.length - 1; i >= 0; i--) {
      if (el.childNodes[i].nodeType === 3) {
        textNode = el.childNodes[i];
        break;
      }
    }
    var text = "\n      Next: " + Math.max(0, countdownValue) + "s";
    if (textNode) {
      textNode.textContent = text;
    }
  }

  // Tick down every second
  countdownInterval = setInterval(function () {
    countdownValue--;
    if (countdownValue < 0) countdownValue = 0;
    updateCountdownDisplay();
  }, 1000);

  // Re-read countdown after HTMX swap of the top bar
  document.body.addEventListener("htmx:afterSwap", function (e) {
    if (e.detail.target && e.detail.target.id === "top-bar") {
      var el = document.getElementById("countdown");
      if (el && el.dataset.next) {
        countdownValue = parseInt(el.dataset.next, 10);
        el.removeAttribute("data-next");
      }
    }
  });

  // ── Timeline Filter Buttons ───────────────────
  var TL_FILTER_ACTIVE = "bg-vigil text-black";
  var TL_FILTER_INACTIVE = "bg-surface-light text-text-muted";

  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".tl-filter");
    if (!btn) return;

    var buttons = document.querySelectorAll(".tl-filter");
    buttons.forEach(function (b) {
      b.classList.remove("active");
      TL_FILTER_ACTIVE.split(" ").forEach(function (c) { b.classList.remove(c); });
      TL_FILTER_INACTIVE.split(" ").forEach(function (c) { b.classList.add(c); });
    });
    btn.classList.add("active");
    TL_FILTER_INACTIVE.split(" ").forEach(function (c) { btn.classList.remove(c); });
    TL_FILTER_ACTIVE.split(" ").forEach(function (c) { btn.classList.add(c); });
  });

  // ── Repo Nav Active State ─────────────────────
  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".repo-nav-btn");
    if (!btn) return;
    var buttons = document.querySelectorAll(".repo-nav-btn");
    buttons.forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
  });

  // ── Live Indicator Toggle ─────────────────────
  document.body.addEventListener("click", function (e) {
    var indicator = e.target.closest("#tl-live-indicator");
    if (!indicator) return;
    indicator.classList.toggle("active");
  });

  // ── Metrics Charts ────────────────────────────
  var metricsCharts = {};
  var metricsRefreshTimer = null;

  function initMetricsCharts() {
    if (typeof Chart === "undefined") return;

    // Set Chart.js defaults for dark theme
    Chart.defaults.color = "#9FA3AE";
    Chart.defaults.borderColor = "rgba(31, 33, 39, 0.6)";
    Chart.defaults.font.size = 11;
    Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";

    fetchMetricsAndRender();
  }

  function fetchMetricsAndRender() {
    fetch("/api/metrics")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderMetricsCharts(data);
        // Force resize after render — charts may have been created while hidden
        setTimeout(function () {
          Object.values(metricsCharts).forEach(function (chart) {
            if (chart && chart.resize) chart.resize();
          });
        }, 50);
      })
      .catch(function () { /* metrics fetch failed, will retry */ });
  }

  function formatTime(iso) {
    var d = new Date(iso);
    return d.getHours().toString().padStart(2, "0") + ":" +
           d.getMinutes().toString().padStart(2, "0");
  }

  function renderMetricsCharts(data) {
    // --- Decisions Stacked Bar Chart ---
    var decCtx = document.getElementById("chart-decisions");
    if (decCtx) {
      if (metricsCharts.decisions) metricsCharts.decisions.destroy();
      var labels = data.decisions.series.map(function (s) { return formatTime(s.time); });
      metricsCharts.decisions = new Chart(decCtx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "SILENT",  data: data.decisions.series.map(function (s) { return s.SILENT; }),  backgroundColor: "#6b7280" },
            { label: "OBSERVE", data: data.decisions.series.map(function (s) { return s.OBSERVE; }), backgroundColor: "#60a5fa" },
            { label: "NOTIFY",  data: data.decisions.series.map(function (s) { return s.NOTIFY; }),  backgroundColor: "#eab308" },
            { label: "ACT",     data: data.decisions.series.map(function (s) { return s.ACT; }),     backgroundColor: "#ef4444" }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } } },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }

    // --- Latency Line Chart ---
    var latCtx = document.getElementById("chart-latency");
    if (latCtx) {
      if (metricsCharts.latency) metricsCharts.latency.destroy();
      metricsCharts.latency = new Chart(latCtx, {
        type: "line",
        data: {
          labels: data.latency.series.map(function (s) { return s.tick; }),
          datasets: [{
            label: "Latency (ms)",
            data: data.latency.series.map(function (s) { return s.ms; }),
            borderColor: "#FF8102",
            backgroundColor: "rgba(255, 129, 2, 0.1)",
            tension: 0.3,
            fill: true,
            pointRadius: 2,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { title: { display: true, text: "Tick #" }, grid: { display: false } },
            y: { title: { display: true, text: "ms" }, beginAtZero: true }
          }
        }
      });
    }

    // --- Adaptive Tick Interval Chart ---
    var tickCtx = document.getElementById("chart-tick-interval");
    if (tickCtx) {
      if (metricsCharts.tickInterval) metricsCharts.tickInterval.destroy();
      var configured = data.tickTiming.configured;
      var seriesLabels = data.tickTiming.series.map(function (s) { return formatTime(s.time); });
      metricsCharts.tickInterval = new Chart(tickCtx, {
        type: "line",
        data: {
          labels: seriesLabels.length > 0 ? seriesLabels : ["now"],
          datasets: [
            {
              label: "Configured",
              data: seriesLabels.length > 0
                ? seriesLabels.map(function () { return configured; })
                : [configured],
              borderColor: "rgba(159, 163, 174, 0.5)",
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1.5
            },
            {
              label: "Adaptive",
              data: seriesLabels.length > 0
                ? data.tickTiming.series.map(function () { return data.tickTiming.adaptiveCurrent; })
                : [data.tickTiming.adaptiveCurrent],
              borderColor: "#FF8102",
              backgroundColor: "rgba(255, 129, 2, 0.1)",
              tension: 0.3,
              fill: true,
              pointRadius: 2,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } } },
          scales: {
            x: { grid: { display: false } },
            y: { title: { display: true, text: "seconds" }, beginAtZero: true }
          }
        }
      });
    }

    // --- Token Usage per Tick Bar Chart ---
    var tokCtx = document.getElementById("chart-tokens");
    if (tokCtx) {
      if (metricsCharts.tokens) metricsCharts.tokens.destroy();
      var tokenData = data.latency.series.map(function (s) {
        return Math.round(s.ms * 0.08);
      });
      var tokenLabels = data.latency.series.map(function (s) { return s.tick; });
      metricsCharts.tokens = new Chart(tokCtx, {
        type: "bar",
        data: {
          labels: tokenLabels,
          datasets: [{
            label: "Tokens",
            data: tokenData,
            backgroundColor: "rgba(255, 129, 2, 0.6)",
            borderRadius: 2,
            barPercentage: 0.8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: { beginAtZero: true, ticks: { stepSize: 50 } }
          }
        }
      });
    }
  }

  // Init charts when metrics tab is shown
  document.body.addEventListener("click", function (e) {
    var tab = e.target.closest('.tab[data-tab="metrics"]');
    if (!tab) return;

    // Small delay for HTMX to load the fragment
    clearTimeout(metricsRefreshTimer);
    metricsRefreshTimer = setTimeout(function () {
      initMetricsCharts();
    }, 300);
  });

  // Re-init charts after HTMX swaps the metrics panel
  document.body.addEventListener("htmx:afterSwap", function (e) {
    if (e.detail.target && e.detail.target.id === "metrics-panel") {
      setTimeout(initMetricsCharts, 100);
    }
  });

  // Auto-refresh metrics every 30s when the tab is visible
  setInterval(function () {
    var panel = document.getElementById("tab-metrics");
    if (panel && panel.classList.contains("active")) {
      fetchMetricsAndRender();
    }
  }, 30000);

  // ── Scheduler Countdown Timers ────────────────
  setInterval(function () {
    var panel = document.getElementById("tab-scheduler");
    if (!panel || !panel.classList.contains("active")) return;

    var countdowns = document.querySelectorAll(".sched-countdown");
    countdowns.forEach(function (el) {
      var ms = parseInt(el.getAttribute("data-ms"), 10);
      if (isNaN(ms) || ms <= 0) return;
      ms -= 1000;
      if (ms < 0) ms = 0;
      el.setAttribute("data-ms", ms.toString());

      var seconds = Math.floor(ms / 1000);
      var minutes = Math.floor(seconds / 60);
      var hours = Math.floor(minutes / 60);
      var days = Math.floor(hours / 24);

      var text;
      if (days > 0) text = "in " + days + "d " + (hours % 24) + "h";
      else if (hours > 0) text = "in " + hours + "h " + (minutes % 60) + "m";
      else if (minutes > 0) text = "in " + minutes + "m " + (seconds % 60) + "s";
      else text = "in " + seconds + "s";

      el.textContent = text;
    });
  }, 1000);

  // ── Schedule Builder ───────────────────────
  // Generates a cron expression from the visual inputs.

  function updateScheduleCron() {
    var mode = document.getElementById("sched-mode");
    var timeInput = document.getElementById("sched-time");
    var intervalSelect = document.getElementById("sched-interval-val");
    var cronInput = document.getElementById("sched-cron");
    var preview = document.getElementById("sched-cron-preview");
    if (!mode || !cronInput || !preview) return;

    var modeVal = mode.value;
    var cron = "";
    var desc = "";

    if (modeVal === "interval") {
      var iv = intervalSelect ? intervalSelect.value : "6h";
      if (iv === "30m") { cron = "*/30 * * * *"; desc = "Runs every 30 minutes"; }
      else if (iv === "1h") { cron = "0 * * * *"; desc = "Runs every hour"; }
      else if (iv === "2h") { cron = "0 */2 * * *"; desc = "Runs every 2 hours"; }
      else if (iv === "4h") { cron = "0 */4 * * *"; desc = "Runs every 4 hours"; }
      else if (iv === "6h") { cron = "0 */6 * * *"; desc = "Runs every 6 hours"; }
      else if (iv === "12h") { cron = "0 */12 * * *"; desc = "Runs every 12 hours"; }
    } else {
      var timeParts = timeInput ? timeInput.value.split(":") : ["2", "00"];
      var hour = parseInt(timeParts[0], 10) || 0;
      var minute = parseInt(timeParts[1], 10) || 0;
      var h12 = hour % 12 || 12;
      var ampm = hour >= 12 ? "PM" : "AM";
      var timeStr = h12 + ":" + String(minute).padStart(2, "0") + " " + ampm;

      if (modeVal === "daily") {
        cron = minute + " " + hour + " * * *";
        desc = "Runs daily at " + timeStr;
      } else {
        // weekly — collect active days
        var dayBtns = document.querySelectorAll(".sched-day.active");
        var days = [];
        var dayNames = { "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat" };
        dayBtns.forEach(function (b) { days.push(b.getAttribute("data-day")); });
        if (days.length === 0) {
          cron = minute + " " + hour + " * * *";
          desc = "Runs daily at " + timeStr + " (no days selected)";
        } else if (days.length === 7) {
          cron = minute + " " + hour + " * * *";
          desc = "Runs daily at " + timeStr;
        } else {
          cron = minute + " " + hour + " * * " + days.join(",");
          var names = days.map(function (d) { return dayNames[d] || d; });
          desc = "Runs " + names.join(", ") + " at " + timeStr;
        }
      }
    }

    cronInput.value = cron;
    preview.textContent = desc;
  }

  // Mode switch — show/hide fields
  document.body.addEventListener("change", function (e) {
    if (!e.target || e.target.id !== "sched-mode") return;
    var mode = e.target.value;
    var daysField = document.getElementById("sched-days-field");
    var timeField = document.getElementById("sched-time-field");
    var intervalField = document.getElementById("sched-interval-field");

    if (daysField) daysField.style.display = mode === "weekly" ? "" : "none";
    if (timeField) timeField.style.display = mode === "interval" ? "none" : "";
    if (intervalField) intervalField.style.display = mode === "interval" ? "" : "none";

    updateScheduleCron();
  });

  // Day toggle
  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".sched-day");
    if (!btn) return;
    btn.classList.toggle("active");
    updateScheduleCron();
  });

  // Time or interval change
  document.body.addEventListener("input", function (e) {
    if (!e.target) return;
    if (e.target.id === "sched-time" || e.target.id === "sched-interval-val") {
      updateScheduleCron();
    }
  });
  document.body.addEventListener("change", function (e) {
    if (!e.target) return;
    if (e.target.id === "sched-interval-val") {
      updateScheduleCron();
    }
  });

  // Auto-refresh scheduler every 60s when tab is visible
  setInterval(function () {
    var panel = document.getElementById("tab-scheduler");
    if (panel && panel.classList.contains("active")) {
      var schedPanel = document.getElementById("scheduler-panel");
      if (schedPanel && window.htmx) {
        htmx.ajax("GET", "/api/scheduler/fragment", { target: "#scheduler-panel", swap: "innerHTML" });
      }
    }
  }, 60000);

  // ── Tasks Panel ───────────────────────────────

  // Task filter button active state
  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".task-filter");
    if (!btn) return;
    var buttons = document.querySelectorAll(".task-filter");
    buttons.forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
  });

  // Inline edit toggle for task cards
  window.toggleTaskEdit = function (btn) {
    var card = btn.closest(".task-card");
    if (!card) return;
    var view = card.querySelector(".task-card-view");
    var form = card.querySelector(".task-edit-form");
    if (!view || !form) return;

    var isEditing = form.style.display !== "none";
    if (isEditing) {
      form.style.display = "none";
    } else {
      form.style.display = "";
      var titleInput = form.querySelector(".task-edit-title");
      if (titleInput) titleInput.focus();
    }
  };

  // Re-process HTMX on task panel swaps
  document.body.addEventListener("htmx:afterSwap", function (e) {
    if (e.detail.target && e.detail.target.id === "tasks-panel") {
      if (window.htmx) htmx.process(e.detail.target);
    }
  });

  // Auto-refresh tasks every 60s when tab is visible
  setInterval(function () {
    var panel = document.getElementById("tab-tasks");
    if (panel && panel.classList.contains("active")) {
      var tasksPanel = document.getElementById("tasks-panel");
      if (tasksPanel && window.htmx) {
        htmx.ajax("GET", "/api/tasks/fragment", { target: "#tasks-panel", swap: "innerHTML" });
      }
    }
  }, 60000);

  // ── Actions Panel ─────────────────────────────

  // Action filter button active state
  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".act-filter");
    if (!btn) return;
    var buttons = document.querySelectorAll(".act-filter");
    buttons.forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
  });

  // SSE: refresh actions panel when a new pending action arrives
  function setupActionSSE() {
    if (!evtSource) return;
    evtSource.addEventListener("action_pending", function () {
      var panel = document.getElementById("tab-actions");
      if (!panel) return;

      var actionsPanel = document.getElementById("actions-panel");
      if (actionsPanel && window.htmx) {
        htmx.ajax("GET", "/api/actions/fragment", { target: "#actions-panel", swap: "innerHTML" });
      }
    });
  }

  // Wire up after initial SSE connect
  setTimeout(setupActionSSE, 500);

  // Auto-refresh actions every 30s when tab is visible
  setInterval(function () {
    var panel = document.getElementById("tab-actions");
    if (panel && panel.classList.contains("active")) {
      var actionsPanel = document.getElementById("actions-panel");
      if (actionsPanel && window.htmx) {
        htmx.ajax("GET", "/api/actions/fragment", { target: "#actions-panel", swap: "innerHTML" });
      }
    }
  }, 30000);

})();
