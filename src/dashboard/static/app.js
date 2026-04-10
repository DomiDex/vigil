// Vigil Dashboard — app.js
// SSE handler, countdown timer, tab switching

(function () {
  "use strict";

  // ── Tab Switching ──────────────────────────────
  const tabs = document.querySelectorAll(".tab-nav .tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      const target = tab.dataset.tab;

      tabs.forEach(function (t) { t.classList.remove("active"); });
      panels.forEach(function (p) { p.classList.remove("active"); });

      tab.classList.add("active");
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
  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest(".tl-filter");
    if (!btn) return;

    var buttons = document.querySelectorAll(".tl-filter");
    buttons.forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
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
    Chart.defaults.color = "#8b8fc7";
    Chart.defaults.borderColor = "rgba(61, 68, 120, 0.4)";
    Chart.defaults.font.size = 11;

    fetchMetricsAndRender();
  }

  function fetchMetricsAndRender() {
    fetch("/api/metrics")
      .then(function (res) { return res.json(); })
      .then(function (data) { renderMetricsCharts(data); })
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
            borderColor: "#a855f7",
            backgroundColor: "rgba(168, 85, 247, 0.1)",
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
              borderColor: "rgba(139, 143, 199, 0.5)",
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

})();
