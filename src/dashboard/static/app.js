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
      // Future: prepend to timeline
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

})();
