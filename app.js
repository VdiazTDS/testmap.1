window.addEventListener("error", e => {
  console.error("JS ERROR:", e.message, "at line", e.lineno);
});


// ================= SUPABASE CONFIG =================
// Connection info for cloud file storage
const SUPABASE_URL = "https://lffazhbwvorwxineklsy.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lfh2zlIiTSMB0U-Fe5o6Jg_mJ1qkznh";
const BUCKET = "excel-files";

//======




document.addEventListener("DOMContentLoaded", () => {
  initApp();
  });


// ===== USER GEOLOCATION =====
function locateUser() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      // Center map on user
      map.setView([lat, lon], 14);
    },
    err => {
      console.warn("Location permission denied or unavailable");
      map.setView([39.5, -98.35], 4);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

// ===== FLOATING "CENTER ON ME" BUTTON =====
let watchId = null;
let userCircle = null;
let userMarker = null; // ← ADD THIS


function startLiveTracking() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported on this device.");
    return;
  }

  // Stop previous tracking
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      const latlng = [lat, lng];

      // Smooth follow
      map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 1.2 });

      // ===== Moving marker =====
if (!userMarker) {
  userMarker = L.marker(latlng).addTo(map);
} else {
  userMarker.setLatLng(latlng);
}

// ===== Accuracy circle =====
if (!userCircle) {
  userCircle = L.circle(latlng, {
    radius: accuracy,
    color: "#2a93ff",
    fillColor: "#2a93ff",
    fillOpacity: 0.2,
    weight: 2,
  }).addTo(map);
} else {
  userCircle.setLatLng(latlng);
  userCircle.setRadius(accuracy);
}

      
    },
    (err) => {
      console.error("GPS error:", err);
      alert("Unable to get your location.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    }
  );
}




// ===== HARD REFRESH BUTTON (SAFE + NO CACHE) =====
const hardRefreshBtn = document.getElementById("hardRefreshBtn");

if (hardRefreshBtn) {
  let refreshArmed = false;

  hardRefreshBtn.addEventListener("click", () => {

    // Mobile double-tap protection
    if (window.innerWidth <= 900) {
      if (!refreshArmed) {
        refreshArmed = true;
        hardRefreshBtn.textContent = "Tap again to refresh";

        setTimeout(() => {
          refreshArmed = false;
          hardRefreshBtn.textContent = "Refresh";
        }, 2000);

        return;
      }
    }

    // Clear cache storage if supported
    if ("caches" in window) {
      caches.keys().then(names => names.forEach(n => caches.delete(n)));
    }

    // True hard reload (no cache)
    window.location.href = window.location.pathname + "?v=" + Date.now();
  });
}


//======


// Create Supabase client
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ================= FILE NAME MATCHING =================
// Makes route files and route summary files match even if
// spacing, punctuation, or "RouteSummary" text is different.
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(".xlsx", "")
    .replace("route summary", "")   // handles "Route Summary"
    .replace("routesummary", "")    // handles "RouteSummary"
    .replace(/[_\s.-]/g, "")        // ignore spaces, _, ., -
    .trim();
}


// ================= MAP SETUP =================
// Create Leaflet map
const map = L.map("map").setView([0, 0], 2);
// Shared Canvas renderer for high-performance drawing
const canvasRenderer = L.canvas({ padding: 0.5 });


// Base map layers
const baseMaps = {
  streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
  )
};
//======

// ================= POLYGON SELECT =================


// when polygon created
// ================= POLYGON SELECT =================
let drawnLayer = new L.FeatureGroup();
map.addLayer(drawnLayer);

const drawControl = new L.Control.Draw({
  draw: {
    polygon: true,
    rectangle: true,
    circle: false,
    marker: false,
    polyline: false,
    circlemarker: false
  },
  edit: { featureGroup: drawnLayer }
});

map.addControl(drawControl);

// ===== SELECTION COUNT FUNCTION (GLOBAL & CORRECT) =====
function updateSelectionCount() {
  const polygon = drawnLayer.getLayers()[0];
  let count = 0;

  Object.entries(routeDayGroups).forEach(([key, group]) => {
    const sym = symbolMap[key];

    group.layers.forEach(layer => {
      const base = layer._base;
      if (!base) return;

      const latlng = L.latLng(base.lat, base.lon);

      // Reset original color
      layer.setStyle?.({ color: sym.color, fillColor: sym.color });

      // Highlight if inside polygon
      if (polygon && polygon.getBounds().contains(latlng) && map.hasLayer(layer)) {
        layer.setStyle?.({ color: "#ffff00", fillColor: "#ffff00" });
        count++;
      }
    });
  });

  document.getElementById("selectionCount").textContent = count;
}

// ===== WHEN POLYGON IS DRAWN =====
map.on(L.Draw.Event.CREATED, e => {
  drawnLayer.clearLayers();
  drawnLayer.addLayer(e.layer);
  updateSelectionCount();
});

// Default map
baseMaps.streets.addTo(map);

// Dropdown to switch map type
document.getElementById("baseMapSelect").addEventListener("change", e => {
  Object.values(baseMaps).forEach(l => map.removeLayer(l));
  baseMaps[e.target.value].addTo(map);
});


// ================= MAP SYMBOL SETTINGS =================
const colors = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c"];
const shapes = ["circle","square","triangle","diamond"];

const symbolMap = {};        // stores symbol for each route/day combo
const routeDayGroups = {};   // stores map markers grouped by route/day
let symbolIndex = 0;
let globalBounds = L.latLngBounds(); // used to zoom map to all points


// Convert day number → day name
function dayName(n) {
  return ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][n-1];
}


// Assign a unique color/shape to each route/day
function getSymbol(key) {
  if (!symbolMap[key]) {
    symbolMap[key] = {
      color: colors[symbolIndex % colors.length],
      shape: shapes[Math.floor(symbolIndex / colors.length) % shapes.length]
    };
    symbolIndex++;
  }
  return symbolMap[key];
}

//=====
function getMarkerPixelSize() {
  const z = map.getZoom();

  if (z <= 5) return 2;
  if (z <= 8) return 3;
  if (z <= 11) return 4;
  if (z <= 14) return 6;
  return 8;
}




// Create marker with correct shape
function createMarker(lat, lon, symbol) {
  const size = getMarkerPixelSize();

  // ===== CIRCLE =====
  if (symbol.shape === "circle") {
    const marker = L.circleMarker([lat, lon], {
      radius: size,
      color: symbol.color,
      fillColor: symbol.color,
      fillOpacity: 0.95,
      renderer: canvasRenderer
    });

    marker._base = { lat, lon, symbol };
    return marker;
  }

  function pixelOffset() {
    const zoom = map.getZoom();
    const scale = 40075016.686 / Math.pow(2, zoom + 8);
    const latOffset = size * scale / 111320;
    const lngOffset = latOffset / Math.cos(lat * Math.PI / 180);
    return [latOffset, lngOffset];
  }

  const [dLat, dLng] = pixelOffset();

  let shape;

  if (symbol.shape === "square") {
    shape = L.rectangle([[lat - dLat, lon - dLng], [lat + dLat, lon + dLng]], {
      color: symbol.color,
      fillColor: symbol.color,
      fillOpacity: 0.95,
      weight: 1,
      renderer: canvasRenderer
    });
  }

  if (symbol.shape === "triangle") {
    shape = L.polygon(
      [[lat + dLat, lon], [lat - dLat, lon - dLng], [lat - dLat, lon + dLng]],
      {
        color: symbol.color,
        fillColor: symbol.color,
        fillOpacity: 0.95,
        weight: 1,
        renderer: canvasRenderer
      }
    );
  }

  if (symbol.shape === "diamond") {
    shape = L.polygon(
      [[lat + dLat, lon], [lat, lon + dLng], [lat - dLat, lon], [lat, lon - dLng]],
      {
        color: symbol.color,
        fillColor: symbol.color,
        fillOpacity: 0.95,
        weight: 1,
        renderer: canvasRenderer
      }
    );
  }

  shape._base = { lat, lon, symbol };
  return shape;
}



// ================= FILTER CHECKBOX UI =================
function buildRouteCheckboxes(routes) {
  const c = document.getElementById("routeCheckboxes");
  c.innerHTML = "";

  routes.forEach(route => {
    const label = document.createElement("label");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = route;
    checkbox.checked = true;
    checkbox.addEventListener("change", applyFilters);

    const text = document.createTextNode(" " + route);

    label.appendChild(checkbox);
    label.appendChild(text);

    c.appendChild(label);
  });
}



function buildDayCheckboxes() {
  const c = document.getElementById("dayCheckboxes");
  c.innerHTML = "";

  [1,2,3,4,5,6,7].forEach(d => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" value="${d}" checked> ${dayName(d)}`;
    l.querySelector("input").addEventListener("change", applyFilters);
    c.appendChild(l);
  });
}
buildDayCheckboxes();


// Select/Deselect all checkboxes
function setCheckboxGroup(containerId, checked) {
  document.querySelectorAll(`#${containerId} input`).forEach(b => (b.checked = checked));
  applyFilters();
}

document.getElementById("routesAll").onclick  = () => setCheckboxGroup("routeCheckboxes", true);
document.getElementById("routesNone").onclick = () => setCheckboxGroup("routeCheckboxes", false);
document.getElementById("daysAll").onclick    = () => setCheckboxGroup("dayCheckboxes", true);
document.getElementById("daysNone").onclick   = () => setCheckboxGroup("dayCheckboxes", false);


// ================= APPLY MAP FILTERS =================
function applyFilters() {
  const routes = [...document.querySelectorAll("#routeCheckboxes input:checked")].map(i => i.value);
  const days   = [...document.querySelectorAll("#dayCheckboxes input:checked")].map(i => i.value);

  Object.entries(routeDayGroups).forEach(([key, group]) => {
    const [r, d] = key.split("|");
    const show = routes.includes(r) && days.includes(d);
    group.layers.forEach(l => show ? l.addTo(map) : map.removeLayer(l));
  });

  updateStats();
}


// ================= ROUTE STATISTICS =================
function updateStats() {
  const list = document.getElementById("statsList");
  list.innerHTML = "";

  Object.entries(routeDayGroups).forEach(([key, group]) => {
    const visible = group.layers.filter(l => map.hasLayer(l)).length;
    if (!visible) return;

    const [r,d] = key.split("|");
    const li = document.createElement("li");
    li.textContent = `Route ${r} – ${dayName(d)}: ${visible}`;
    list.appendChild(li);
  });
}
  // ===== BUILD ROUTE + DAY LAYER CHECKBOXES =====
function buildRouteDayLayerControls() {
  const container = document.getElementById("routeDayLayers");
  if (!container) return;

  container.innerHTML = "";

  Object.entries(routeDayGroups).forEach(([key, group]) => {
    const [route, day] = key.split("|");
    const sym = symbolMap[key];

    const item = document.createElement("div");
    item.className = "route-day-item";

    // LEFT SIDE
    const left = document.createElement("div");
    left.className = "route-day-left";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;

    const label = document.createElement("span");
    label.textContent = `Route ${route} — ${dayName(day)}`;

    left.appendChild(checkbox);
    left.appendChild(label);

    // RIGHT SIDE SYMBOL
    const icon = document.createElement("span");
    icon.className = "route-day-symbol";

    if (sym.shape === "circle") {
      icon.style.background = sym.color;
      icon.style.borderRadius = "50%";
    }

    if (sym.shape === "square") {
      icon.style.background = sym.color;
    }

    if (sym.shape === "triangle") {
      icon.style.width = "0";
      icon.style.height = "0";
      icon.style.borderLeft = "6px solid transparent";
      icon.style.borderRight = "6px solid transparent";
      icon.style.borderBottom = `12px solid ${sym.color}`;
    }

    if (sym.shape === "diamond") {
      icon.style.background = sym.color;
      icon.style.transform = "rotate(45deg)";
    }

    // TOGGLE VISIBILITY
    checkbox.addEventListener("change", () => {
      group.layers.forEach(layer => {
        checkbox.checked ? layer.addTo(map) : map.removeLayer(layer);
      });

      updateStats();
      updateSelectionCount();
    });

    item.appendChild(left);
    item.appendChild(icon);
    container.appendChild(item);
  });
}

// ================= PROCESS ROUTE EXCEL =================
function processExcelBuffer(buffer) {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  // Clear previous map data
  Object.values(routeDayGroups).forEach(g => g.layers.forEach(l => map.removeLayer(l)));
  Object.keys(routeDayGroups).forEach(k => delete routeDayGroups[k]);
  Object.keys(symbolMap).forEach(k => delete symbolMap[k]);
  symbolIndex = 0;
  globalBounds = L.latLngBounds();

  const routeSet = new Set();

  // Create markers
  rows.forEach(row => {
    const lat = Number(row.LATITUDE);
    const lon = Number(row.LONGITUDE);
    const route = String(row.NEWROUTE);
    const day = String(row.NEWDAY);

    if (!lat || !lon || !route || !day) return;

    const key = `${route}|${day}`;
    const symbol = getSymbol(key);

    if (!routeDayGroups[key]) routeDayGroups[key] = { layers: [] };

    const m = createMarker(lat, lon, symbol)
      .bindPopup(`Route ${route}<br>${dayName(day)}`)
      .addTo(map);

    routeDayGroups[key].layers.push(m);
    routeSet.add(route);
    globalBounds.extend([lat, lon]);
  });

buildRouteCheckboxes([...routeSet]);

// 🔴 THIS LINE IS REQUIRED
buildRouteDayLayerControls();

applyFilters();
map.fitBounds(globalBounds);

}


// ================= LIST FILES FROM CLOUD =================
async function listFiles() {
  const { data, error } = await sb.storage.from(BUCKET).list();
  if (error) return console.error(error);

  const ul = document.getElementById("savedFiles");
  ul.innerHTML = "";

  const routeFiles = {};
  const summaryFiles = {};

 // Separate route files and summary files
data.forEach(file => {
  const name = file.name.toLowerCase();

  if (name.includes("routesummary")) {
    summaryFiles[normalizeName(name)] = file.name;
  } else {
    routeFiles[normalizeName(name)] = file.name;
  }
});


  // Build UI
  Object.keys(routeFiles).forEach(key => {
    const routeName = routeFiles[key];
    const summaryName = summaryFiles[key];

    const li = document.createElement("li");

    // OPEN MAP
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open Map";

    openBtn.onclick = async () => {
      const { data } = sb.storage.from(BUCKET).getPublicUrl(routeName);
      const r = await fetch(data.publicUrl);
      processExcelBuffer(await r.arrayBuffer());

      loadSummaryFor(routeName);
    };

    li.appendChild(openBtn);

    // SUMMARY BUTTON
    if (summaryName) {
      const summaryBtn = document.createElement("button");
      summaryBtn.textContent = "Summary";
      summaryBtn.style.marginLeft = "5px";
      summaryBtn.onclick = () => loadSummaryFor(routeName);
      li.appendChild(summaryBtn);
    }

    // DELETE
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.style.marginLeft = "5px";

    delBtn.onclick = async () => {
      const toDelete = [routeName];
      if (summaryName) toDelete.push(summaryName);

      await sb.storage.from(BUCKET).remove(toDelete);
      listFiles();
    };

    li.appendChild(delBtn);
    li.appendChild(document.createTextNode(" " + routeName));
    ul.appendChild(li);
  });
}


// ================= UPLOAD FILE =================
async function uploadFile(file) {
  if (!file) return;

  const { error } = await sb.storage.from(BUCKET).upload(file.name, file, { upsert: true });

  if (error) {
    console.error("UPLOAD ERROR:", error);
    alert("Upload failed: " + error.message);
    return;
  }

  processExcelBuffer(await file.arrayBuffer());
  listFiles();
}


// ================= ROUTE SUMMARY DISPLAY =================
function showRouteSummary(rows, headers)
 {
  const tableBox = document.getElementById("routeSummaryTable");
  const panel = document.getElementById("bottomSummary");
  const btn = document.getElementById("summaryToggleBtn");

  if (!tableBox || !panel || !btn) return;

  tableBox.innerHTML = "";

  if (!rows || !rows.length) {
    tableBox.textContent = "No summary data found";
    return;
  }

  // ✅ Get headers EXACTLY in Excel order
  

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  // ===== HEADER ROW =====
  const headerRow = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h ?? "";
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // ===== DATA ROWS =====
  rows.forEach(r => {
    const tr = document.createElement("tr");

    headers.forEach(h => {
      const td = document.createElement("td");
      td.textContent = r[h] ?? "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  tableBox.appendChild(table);

// AUTO-OPEN + FORCE VISIBLE HEIGHT
const savedHeight = localStorage.getItem("summaryHeight");

// Always prepare a usable expanded height
const defaultHeight = window.innerWidth <= 900 ? 300 : 250;
panel.style.height = (savedHeight && savedHeight > 60 ? savedHeight : defaultHeight) + "px";

// Only auto-open on desktop
if (window.innerWidth > 900) {
  panel.classList.remove("collapsed");
  btn.textContent = "▼";
}


}



// Load matching summary file
async function loadSummaryFor(routeFileName) {
  const { data, error } = await sb.storage.from(BUCKET).list();
  if (error) {
    console.error("LIST ERROR:", error);
    return;
  }

  console.log("ALL FILES:", data.map(f => f.name));
  console.log("ROUTE FILE CLICKED:", routeFileName);

  const normalizedRoute = normalizeName(routeFileName);
  console.log("NORMALIZED ROUTE:", normalizedRoute);

  const summary = data.find(f => {
    const lower = f.name.toLowerCase();
    const normalizedSummary = normalizeName(f.name);

    console.log("CHECKING:", f.name, "→", normalizedSummary);

    return (
      lower.includes("routesummary") ||
      lower.includes("route summary")
    ) && normalizedSummary === normalizedRoute;
  });

  console.log("FOUND SUMMARY:", summary);

  if (!summary) {
    document.getElementById("routeSummaryTable").textContent = "No summary available";
    return;
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(summary.name);
  const r = await fetch(urlData.publicUrl);

  const wb = XLSX.read(new Uint8Array(await r.arrayBuffer()), { type: "array" });
const ws = wb.Sheets[wb.SheetNames[0]];

// Read entire sheet as grid
const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

// ===== FIND FIRST NON-EMPTY ROW =====
let startRow = raw.findIndex(r =>
  r && r.some(cell => String(cell || "").trim() !== "")
);

if (startRow === -1) {
  showRouteSummary([], []);
  return;
}

// ===== DETECT MULTI-ROW HEADERS (supports 1–3+) =====
let headerRows = [raw[startRow]];
let nextRow = raw[startRow + 1];
let thirdRow = raw[startRow + 2];

function looksLikeHeader(row) {
  if (!row) return false;

  const filled = row.filter(c => String(c || "").trim() !== "").length;
  const numeric = row.filter(c => !isNaN(parseFloat(c))).length;

  return filled > 0 && numeric < filled / 2;
}

if (looksLikeHeader(nextRow)) headerRows.push(nextRow);
if (looksLikeHeader(thirdRow)) headerRows.push(thirdRow);

// ===== BUILD SAFE COLUMN NAMES =====
const columnCount = Math.max(...headerRows.map(r => r.length));

const headers = Array.from({ length: columnCount }, (_, col) => {
  const parts = headerRows
    .map(r => String(r[col] || "").trim())
    .filter(Boolean);

  return parts.join(" ") || `Column ${col + 1}`;
});

// ===== DATA STARTS AFTER HEADER =====
const dataStartIndex = startRow + headerRows.length;

// ===== BUILD ROW OBJECTS =====
const rows = raw.slice(dataStartIndex).map(r => {
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = r?.[i] ?? "";
  });
  return obj;
});




showRouteSummary(rows, headers);


// 🔽 FORCE the panel open when a summary exists
const panel = document.getElementById("bottomSummary");
const btn = document.getElementById("summaryToggleBtn");

const isMobile = window.innerWidth <= 900;

if (panel && btn && !isMobile) {
  panel.classList.remove("collapsed");
  btn.textContent = "▼";
}



}



// ================= START APP =================
// ===== TOGGLE BOTTOM SUMMARY =====
function toggleSummary() {
  const panel = document.getElementById("bottomSummary");
  const btn = document.getElementById("summaryToggleBtn");

  panel.classList.toggle("collapsed");

  // flip arrow direction
  btn.textContent = panel.classList.contains("collapsed") ? "▲" : "▼";
}
// ===== PLACE LOCATE BUTTON BASED ON SCREEN SIZE =====
function placeLocateButton() {
  const btn = document.getElementById("locateMeBtn");
  const desktopContainer = document.getElementById("desktopLocateContainer");
  const headerContainer = document.querySelector(".mobile-header-buttons");

  if (!btn || !desktopContainer || !headerContainer) return;

  if (window.innerWidth <= 900) {
    headerContainer.appendChild(btn);   // 📱 mobile → header
  } else {
    desktopContainer.appendChild(btn);  // 🖥 desktop → right sidebar
  }
}

window.addEventListener("resize", placeLocateButton);
window.addEventListener("load", placeLocateButton);


function initApp() {

// ===== RIGHT SIDEBAR TOGGLE =====

// ===== RIGHT SIDEBAR TOGGLE =====
const selectionBox = document.getElementById("selectionBox");
const toggleSelectionBtn = document.getElementById("toggleSelectionBtn");
const clearBtn = document.getElementById("clearSelectionBtn");

// Toggle sidebar open/closed
if (selectionBox && toggleSelectionBtn) {
  toggleSelectionBtn.onclick = () => {
    const collapsed = selectionBox.classList.toggle("collapsed");
    toggleSelectionBtn.textContent = collapsed ? "❮" : "❯";
  };
}

// Clear selection button (ALWAYS ACTIVE)
if (clearBtn) {
  clearBtn.onclick = () => {
    // Remove polygon
    drawnLayer.clearLayers();

    // Restore original marker colors
    Object.entries(routeDayGroups).forEach(([key, group]) => {
      const sym = symbolMap[key];
      group.layers.forEach(marker => {
        marker.setStyle?.({ color: sym.color, fillColor: sym.color });
      });
    });

    // 🔥 Force counter refresh everywhere (desktop + mobile)
    updateSelectionCount();
  };
}







  
// ===== FILE UPLOAD (DRAG + CLICK) =====
const dropZone = document.getElementById("dropZone");

// create hidden file input dynamically (so no HTML change needed)
let fileInput = document.getElementById("fileInput");
if (!fileInput) {
  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".xlsx,.xls,.csv";
  fileInput.id = "fileInput";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
}

// CLICK → open picker
dropZone.addEventListener("click", () => fileInput.click());

// FILE SELECTED
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) uploadFile(file);
});

// PREVENT browser opening file on drop
["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
  dropZone.addEventListener(evt, e => e.preventDefault());
});

// DROP → upload
dropZone.addEventListener("drop", e => {
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});


// ===== INITIAL MAP LAYER + USER LOCATION =====
baseMaps.streets.addTo(map);



  
  // ===== BASE MAP DROPDOWN =====
  const baseSelect = document.getElementById("baseMapSelect");
  if (baseSelect) {
    baseSelect.addEventListener("change", e => {
      Object.values(baseMaps).forEach(l => map.removeLayer(l));
      baseMaps[e.target.value].addTo(map);
    });
  }

  // ===== SIDEBAR TOGGLE (DESKTOP) =====
  const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
  const sidebar = document.querySelector(".sidebar");
  const appContainer = document.querySelector(".app-container");

  if (toggleSidebarBtn && sidebar && appContainer) {
    toggleSidebarBtn.addEventListener("click", () => {
      appContainer.classList.toggle("collapsed");

      toggleSidebarBtn.textContent =
        appContainer.classList.contains("collapsed") ? "▶" : "◀";

      setTimeout(() => map.invalidateSize(), 200);
    });
  }

// ===== MOBILE MENU =====
const mobileMenuBtn = document.getElementById("mobileMenuBtn");

const overlay = document.querySelector(".mobile-overlay");

if (mobileMenuBtn && sidebar && overlay) {

  mobileMenuBtn.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");

    mobileMenuBtn.textContent = open ? "✕" : "☰";
    overlay.classList.toggle("show", open);

    setTimeout(() => map.invalidateSize(), 200);
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    mobileMenuBtn.textContent = "☰";
  });
}
// ===== MOBILE SELECTION TOGGLE =====
const mobileSelBtn = document.getElementById("mobileSelectionBtn");


if (mobileSelBtn && selectionBox) {

  mobileSelBtn.addEventListener("click", () => {
    selectionBox.classList.toggle("show");
  });

  // keep count synced
  const originalUpdate = updateSelectionCount;
  updateSelectionCount = function () {
    originalUpdate();
    mobileSelBtn.textContent =
      "Selected: " + document.getElementById("selectionCount").textContent;
  };
}


  // ===== RESIZABLE BOTTOM SUMMARY PANEL =====
  const panel = document.getElementById("bottomSummary");
  const header = document.querySelector(".bottom-summary-header");
  const toggleBtn = document.getElementById("summaryToggleBtn");

  if (panel && header) {
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    // Restore saved height
    const savedHeight = localStorage.getItem("summaryHeight");
    if (savedHeight) panel.style.height = savedHeight + "px";

    // ===== FORCE MOBILE TO START COLLAPSED =====
if (window.innerWidth <= 900) {
  panel.classList.add("collapsed");
  panel.style.height = "40px";
}

    // Drag resize
    header.addEventListener("mousedown", e => {
      isDragging = true;
      startY = e.clientY;
      startHeight = panel.offsetHeight;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", e => {
      if (!isDragging) return;

      const delta = startY - e.clientY;
      let newHeight = startHeight + delta;

      const minHeight = 40;
      const maxHeight = window.innerHeight - 100;

      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      panel.style.height = newHeight + "px";
    });

    document.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.userSelect = "";
  localStorage.setItem("summaryHeight", panel.offsetHeight);

  // Hide resize hint after first drag
  const hint = document.querySelector(".resize-hint");
  if (hint) hint.style.display = "none";
});


    // Collapse toggle
if (toggleBtn) {
  toggleBtn.onclick = () => {
    const isCollapsed = panel.classList.toggle("collapsed");

   if (isCollapsed) {
  localStorage.setItem("summaryHeight", panel.offsetHeight);
  panel.style.height = "40px";
  toggleBtn.textContent = "▲";
} else {
  let restored = localStorage.getItem("summaryHeight");

  if (!restored || restored <= 60) {
    restored = window.innerWidth <= 900 ? 300 : 250;
  }

  panel.style.height = restored + "px";
  toggleBtn.textContent = "▼";
}

  };
}

  }

  // ===== POP-OUT SUMMARY WINDOW =====
  const popoutBtn = document.getElementById("popoutSummaryBtn");

  if (popoutBtn) {
    popoutBtn.onclick = () => {
      const tableHTML = document.getElementById("routeSummaryTable")?.innerHTML;

      if (!tableHTML || tableHTML.includes("No summary")) {
        alert("No route summary loaded.");
        return;
      }

      const win = window.open("", "_blank", "width=900,height=600,resizable=yes,scrollbars=yes");

      win.document.write(`
        <html>
          <head>
            <title>Route Summary</title>
            <style>
              body { font-family: Roboto, sans-serif; margin: 10px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
              th { background: #f4f4f4; position: sticky; top: 0; }
            </style>
          </head>
          <body>
            <h2>Route Summary</h2>
            ${tableHTML}
          </body>
        </html>
      `);

      win.document.close();
    };
  }
//======
// ===== RESET MAP BUTTON (TRUE HARD RESET FOR THIS APP) =====
const resetBtn = document.getElementById("resetMapBtn");

if (resetBtn) {
  resetBtn.addEventListener("click", () => {

    // 1. Reset map view
    map.setView([39.5, -98.35], 4);

    // 2. Clear drawn polygon
    drawnLayer.clearLayers();

    // 3. Remove ALL markers from map
    Object.values(routeDayGroups).forEach(group => {
      group.layers.forEach(marker => map.removeLayer(marker));
    });

    // 4. Clear stored marker groups & symbols
    Object.keys(routeDayGroups).forEach(k => delete routeDayGroups[k]);
    Object.keys(symbolMap).forEach(k => delete symbolMap[k]);

    // 5. Reset counters & stats
    document.getElementById("selectionCount").textContent = "0";
    document.getElementById("statsList").innerHTML = "";

    // 6. Clear route/day checkbox UI
    document.getElementById("routeCheckboxes").innerHTML = "";
    buildDayCheckboxes();

    // 7. Reset bounds tracker
    globalBounds = L.latLngBounds();

    // 8. Clear bottom summary
    const summary = document.getElementById("routeSummaryTable");
    if (summary) summary.innerHTML = "No summary loaded";

    // 9. Collapse summary panel
    const panel = document.getElementById("bottomSummary");
    const btn = document.getElementById("summaryToggleBtn");
    if (panel && btn) {
      panel.classList.add("collapsed");
      panel.style.height = "40px";
      btn.textContent = "▲";
    }
  });
}


// ===== LIVE GPS BUTTON =====
const locateBtn = document.getElementById("locateMeBtn");

if (locateBtn) {
  let tracking = false;

  locateBtn.addEventListener("click", () => {
    if (!tracking) {
      startLiveTracking();
      locateBtn.textContent = "■";
      locateBtn.classList.add("tracking");   // 🔴 turns button red
      tracking = true;
    } else {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      locateBtn.textContent = "📍";
      locateBtn.classList.remove("tracking"); // 🔵 back to blue
      tracking = false;
    }
  });
}


  




// ===== AUTO-RESIZE MARKERS ON ZOOM =====
map.on("zoomend", () => {
  const newSize = getMarkerPixelSize();

  Object.values(routeDayGroups).forEach(group => {
    group.layers.forEach(layer => {
      const base = layer._base;
      if (!base) return;

      // ---- CIRCLE ----
      if (layer.setRadius) {
        layer.setRadius(newSize);
        return;
      }

      const { lat, lon, symbol } = base;

      const scale = 40075016.686 / Math.pow(2, map.getZoom() + 8);
      const dLat = newSize * scale / 111320;
      const dLng = dLat / Math.cos(lat * Math.PI / 180);

      // ---- SQUARE ----
      if (symbol.shape === "square") {
        layer.setBounds([[lat - dLat, lon - dLng], [lat + dLat, lon + dLng]]);
      }

      // ---- TRIANGLE ----
      if (symbol.shape === "triangle") {
        layer.setLatLngs([
          [lat + dLat, lon],
          [lat - dLat, lon - dLng],
          [lat - dLat, lon + dLng]
        ]);
      }

      // ---- DIAMOND ----
      if (symbol.shape === "diamond") {
        layer.setLatLngs([
          [lat + dLat, lon],
          [lat, lon + dLng],
          [lat - dLat, lon],
          [lat, lon - dLng]
        ]);
      }
    });
  });
});

  
// Position Locate button correctly for desktop/mobile
placeLocateButton();
window.addEventListener("resize", placeLocateButton);






  
  listFiles();
}
