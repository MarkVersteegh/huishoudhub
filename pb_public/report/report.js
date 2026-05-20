(function() {
  const EVENTS_URL = "/api/collections/task_events/records?perPage=100";
  // Bekende kolommen eerst, daarna eventuele nieuwe/extra PocketBase-velden automatisch achteraan.
  const preferredColumns = [
    "id",
    "event_type",
    "created",
    "task_id",
    "task_title",
    "task_date",
    "task_persons",
    "actors",
    "done_at",
    "done_by",
    "details",
    "task_snapshot",
    "updated",
    "collectionId",
    "collectionName",
  ];

  let records = [];
  let columns = [];
  let grid = null;

  function $(id) {
    return document.getElementById(id);
  }

  function asText(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(asText).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  // Grid.js verwacht platte tekstwaarden; JSON-kolommen blijven leesbaar via stringify.
  function flatten(record) {
    const flat = {};
    Object.keys(record).forEach(function(key) {
      if (key === "expand") return;
      flat[key] = asText(record[key]);
    });

    return flat;
  }

  async function fetchPage(page) {
    const res = await fetch(EVENTS_URL + "&page=" + page);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function loadRecords() {
    $("reportStatus").textContent = "Laden...";
    const first = await fetchPage(1);
    let items = first.items || [];
    const totalPages = first.totalPages || 1;

    for (let page = 2; page <= totalPages; page++) {
      const data = await fetchPage(page);
      items = items.concat(data.items || []);
    }

    records = items.map(flatten);
    columns = buildColumns(records);
    $("reportStatus").textContent = "Geladen";
    render();
  }

  // De kolommen worden afgeleid uit de records zodat nieuwe auditvelden vanzelf zichtbaar zijn.
  function buildColumns(rows) {
    const seen = {};
    const discovered = [];
    rows.forEach(function(row) {
      Object.keys(row).forEach(function(key) {
        if (!seen[key]) {
          seen[key] = true;
          discovered.push(key);
        }
      });
    });

    const ordered = preferredColumns.filter(function(key) { return seen[key]; });
    discovered.forEach(function(key) {
      if (ordered.indexOf(key) === -1) ordered.push(key);
    });
    return ordered;
  }

  // Filters werken client-side op de geladen auditregels.
  function filteredRows() {
    const person = $("personFilter").value;
    const eventType = $("eventTypeFilter").value;
    const from = $("dateFromFilter").value;
    const to = $("dateToFilter").value;
    const doneBy = $("doneByFilter").value;

    return records.filter(function(row) {
      if (person && row.task_persons.split(",").map(function(p) { return p.trim(); }).indexOf(person) === -1) return false;
      if (eventType && row.event_type !== eventType) return false;
      const actionDate = row.created ? row.created.slice(0, 10) : "";
      if (from && actionDate < from) return false;
      if (to && actionDate > to) return false;
      const doneByValues = (row.actors || row.done_by || "").split(",").map(function(p) { return p.trim(); });
      if (doneBy && doneByValues.indexOf(doneBy) === -1) return false;
      return true;
    });
  }

  function tableData(rows) {
    return rows.map(function(row) {
      return columns.map(function(column) {
        return row[column] || "";
      });
    });
  }

  function render() {
    const rows = filteredRows();
    $("reportCount").textContent = rows.length + " van " + records.length + " acties";

    if (!window.gridjs) {
      $("table").innerHTML = "<p class=\"fallback\">Tabelcomponent kon niet laden. Controleer de internetverbinding voor Grid.js.</p>";
      return;
    }

    const config = {
      columns: columns,
      data: tableData(rows),
      search: true,
      sort: true,
      pagination: { limit: 25 },
      fixedHeader: true,
      height: "68vh",
      language: {
        search: { placeholder: "Zoeken..." },
        pagination: {
          previous: "Vorige",
          next: "Volgende",
          showing: "Toont",
          results: function() { return "regels"; },
        },
        noRecordsFound: "Geen acties gevonden",
      },
    };

    if (!grid) {
      grid = new gridjs.Grid(config).render($("table"));
    } else {
      grid.updateConfig(config).forceRender();
    }
  }

  // Reset laat de opgehaalde data staan en rendert alleen de tabel opnieuw.
  function clearFilters() {
    ["personFilter", "eventTypeFilter", "dateFromFilter", "dateToFilter", "doneByFilter"].forEach(function(id) {
      $(id).value = "";
    });
    render();
  }

  ["personFilter", "eventTypeFilter", "dateFromFilter", "dateToFilter", "doneByFilter"].forEach(function(id) {
    $(id).addEventListener("change", render);
  });
  $("clearFiltersButton").addEventListener("click", clearFilters);
  $("refreshButton").addEventListener("click", loadRecords);

  loadRecords().catch(function(err) {
    $("reportStatus").textContent = "Laden mislukt: " + err.message;
  });
})();
