(function () {
  "use strict";

  const state = {
    lines: null,       // contenu de data/lines.json
    incidents: null,   // contenu de data/incidents.json
    mode: "metro",
    pieChart: null,
  };

  const el = (id) => document.getElementById(id);

  async function loadData() {
    const [linesRes, incidentsRes] = await Promise.all([
      fetch("data/lines.json"),
      fetch("data/incidents.json"),
    ]);
    state.lines = await linesRes.json();
    state.incidents = await incidentsRes.json();
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function incidentsForLine(mode, code) {
    const all = Object.values(state.incidents.incidents || {});
    return all.filter((i) => i.mode === mode && i.line_code === code);
  }

  function countByLine(mode) {
    const all = Object.values(state.incidents.incidents || {});
    const counts = {};
    for (const inc of all) {
      if (inc.mode !== mode) continue;
      counts[inc.line_code] = (counts[inc.line_code] || 0) + 1;
    }
    return counts;
  }

  function logoHTML(mode, code, color, text, big) {
    const sizeClass = big ? "line-logo-big" : "line-logo";
    const round = mode === "metro" ? " round" : "";
    const src = `assets/logos/${mode}/${code}.svg`;
    return `
      <span class="logo-wrap ${sizeClass}">
        <img src="${src}" class="logo-img" alt="Ligne ${code}"
             onload="this.nextElementSibling.style.display='none'"
             onerror="this.style.display='none'">
        <span class="${sizeClass}${round}" style="background:${color}; color:${text}">${code}</span>
      </span>`;
  }


  function renderLinesMenu() {
    const menu = el("lines-menu");
    const busSearch = el("bus-search");
    el("line-detail").classList.add("hidden");
    el("ranking").classList.add("hidden");

    if (state.mode === "classement") {
      menu.classList.add("hidden");
      busSearch.classList.add("hidden");
      renderRanking();
      return;
    }

    el("ranking").classList.add("hidden");
    menu.innerHTML = "";

    if (state.mode === "bus") {
      menu.classList.add("hidden");
      busSearch.classList.remove("hidden");
      return;
    }
    busSearch.classList.add("hidden");
    menu.classList.remove("hidden");

    const lines = state.lines[state.mode] || [];
    const counts = countByLine(state.mode);

    for (const line of lines) {
      const btn = document.createElement("button");
      btn.className = "line-card";
      btn.innerHTML = `
        ${logoHTML(state.mode, line.code, line.color, line.text, false)}
        <span class="line-card-text">
          <span class="line-card-code">Ligne ${line.code}</span>
          <span class="line-card-count">${counts[line.code] || 0} incident(s)</span>
        </span>`;
      btn.addEventListener("click", () => showLineDetail(state.mode, line));
      menu.appendChild(btn);
    }
  }

  function setupBusSearch() {
    const input = el("bus-search-input");
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const code = input.value.trim().toUpperCase();
      if (!code) return;
      showLineDetail("bus", {
        code,
        name: `Ligne de bus ${code}`,
        color: state.lines.bus.color,
        text: state.lines.bus.text,
      });
    });
  }

  // ---------- Détail d'une ligne + camembert ----------

  function showLineDetail(mode, line) {
    el("lines-menu").classList.add("hidden");
    el("bus-search").classList.add("hidden");
    el("ranking").classList.add("hidden");
    const detail = el("line-detail");
    detail.classList.remove("hidden");

    el("line-detail-header").innerHTML = logoHTML(mode, line.code, line.color, line.text, true) +
      `<div><h2 id="detail-title">Ligne ${line.code}</h2><p id="detail-subtitle" class="detail-subtitle">${line.name || ""}</p></div>`;

    const incidents = incidentsForLine(mode, line.code);

    // Camembert : répartition par cause
    const causeCounts = {};
    for (const inc of incidents) {
      causeCounts[inc.cause] = (causeCounts[inc.cause] || 0) + 1;
    }
    const labels = Object.keys(causeCounts);
    const values = Object.values(causeCounts);

    if (state.pieChart) {
      state.pieChart.destroy();
      state.pieChart = null;
    }

    if (labels.length === 0) {
      el("pie-empty").classList.remove("hidden");
      el("pie-chart").classList.add("hidden");
    } else {
      el("pie-empty").classList.add("hidden");
      el("pie-chart").classList.remove("hidden");
      const ctx = el("pie-chart").getContext("2d");
      state.pieChart = new Chart(ctx, {
        type: "pie",
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: palette(labels.length),
            borderColor: "#171a21",
            borderWidth: 2,
          }],
        },
        options: {
          plugins: {
            legend: { position: "bottom", labels: { color: "#eef0f4", boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = values.reduce((a, b) => a + b, 0);
                  const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                  return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    }

    // Historique récent
    const list = el("incident-list");
    list.innerHTML = "";
    const sorted = [...incidents].sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || ""));
    if (sorted.length === 0) {
      list.innerHTML = `<li>Aucun incident historisé pour cette ligne.</li>`;
    }
    for (const inc of sorted.slice(0, 30)) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="incident-cause">${inc.cause}${inc.title ? " — " + inc.title : ""}</div>
        <div class="incident-meta">Détecté le ${formatDate(inc.first_seen)} · Dernière observation le ${formatDate(inc.last_seen)} · Sévérité : ${inc.severity}</div>`;
      list.appendChild(li);
    }
  }

  function palette(n) {
    const base = ["#4da3ff", "#ff6b6b", "#ffd93d", "#6bcB77", "#c084fc", "#f97316", "#38bdf8", "#f472b6", "#a3e635", "#fb7185"];
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  // ---------- Classement global ----------

  function renderRanking() {
    el("ranking").classList.remove("hidden");
    const body = el("ranking-body");
    body.innerHTML = "";

    const all = Object.values(state.incidents.incidents || {});
    const byLine = {};
    for (const inc of all) {
      const k = `${inc.mode}__${inc.line_code}`;
      if (!byLine[k]) {
        byLine[k] = { mode: inc.mode, code: inc.line_code, count: 0, causes: {} };
      }
      byLine[k].count += 1;
      byLine[k].causes[inc.cause] = (byLine[k].causes[inc.cause] || 0) + 1;
    }

    const rows = Object.values(byLine).sort((a, b) => b.count - a.count);

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="5">Aucune donnée pour le moment — laissez la collecte GitHub Actions tourner quelques cycles.</td></tr>`;
      return;
    }

    const modeLabels = { metro: "Métro", rer: "RER", transilien: "Transilien", tram: "Tramway", bus: "Bus" };

    rows.forEach((row, idx) => {
      const topCause = Object.entries(row.causes).sort((a, b) => b[1] - a[1])[0];
      const tr = document.createElement("tr");
      if (idx === 0) tr.classList.add("top-row");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>Ligne ${row.code}</td>
        <td>${modeLabels[row.mode] || row.mode}</td>
        <td>${row.count}</td>
        <td>${topCause ? `${topCause[0]} (${topCause[1]})` : "—"}</td>`;
      body.appendChild(tr);
    });
  }

  // ---------- Onglets de mode ----------

  function setupTabs() {
    document.querySelectorAll(".mode-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode;
        renderLinesMenu();
      });
    });
  }

  async function init() {
    await loadData();
    el("last-update").textContent = state.incidents.last_updated
      ? `Dernière collecte : ${formatDate(state.incidents.last_updated)}`
      : "Aucune collecte n'a encore été exécutée (voir README pour activer la GitHub Action).";
    setupTabs();
    setupBusSearch();
    renderLinesMenu();
  }

  init().catch((err) => {
    console.error(err);
    el("last-update").textContent = "Erreur de chargement des données locales (data/lines.json, data/incidents.json).";
  });
})();
