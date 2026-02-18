const form = document.getElementById("searchForm");
const input = document.getElementById("placeInput");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const netBadge = document.getElementById("netBadge");

const tempC = document.getElementById("tempC");
const desc = document.getElementById("desc");
const place = document.getElementById("place");
const wind = document.getElementById("wind");
const windDir = document.getElementById("windDir");
const feels = document.getElementById("feels");
const updatedAt = document.getElementById("updatedAt");

const LAST_KEY = "weather:lastResult";

// -------------------- PWA: registrar SW --------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      console.log("SW registrado");
    } catch (e) {
      console.warn("SW error:", e);
    }
  });
}

// -------------------- Instalación (A2HS) --------------------
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// -------------------- Online/offline badge --------------------
function updateNetBadge() {
  const online = navigator.onLine;
  netBadge.textContent = online ? "Online" : "Offline";
  netBadge.style.color = online ? "var(--ok)" : "var(--warn)";
}
window.addEventListener("online", updateNetBadge);
window.addEventListener("offline", updateNetBadge);
updateNetBadge();

// -------------------- Render helpers --------------------
function weatherCodeToText(code) {
  // Tabla simple (Open-Meteo weathercode)
  const map = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla con escarcha",
    51: "Llovizna ligera",
    53: "Llovizna moderada",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia moderada",
    65: "Lluvia intensa",
    71: "Nieve ligera",
    73: "Nieve moderada",
    75: "Nieve intensa",
    80: "Chubascos ligeros",
    81: "Chubascos moderados",
    82: "Chubascos intensos",
    95: "Tormenta",
    96: "Tormenta con granizo (ligero)",
    99: "Tormenta con granizo (fuerte)"
  };
  return map[code] ?? `Condición (${code})`;
}

// Sensación aproximada (muy básica): penaliza si hay viento
function approxFeelsLike(temp, windKmh) {
  const penalty = Math.min(6, (windKmh || 0) / 10);
  return Math.round((temp - penalty) * 10) / 10;
}

function showStatus(msg) {
  statusEl.textContent = msg;
}

function render(data, sourceLabel) {
  resultEl.hidden = false;

  tempC.textContent = Math.round(data.current.temperature_2m);
  desc.textContent = weatherCodeToText(data.current.weather_code);
  place.textContent = `${data.place.name}${data.place.admin ? ", " + data.place.admin : ""} (${data.place.country})`;

  wind.textContent = Math.round(data.current.wind_speed_10m);
  windDir.textContent = Math.round(data.current.wind_direction_10m);
  feels.textContent = approxFeelsLike(data.current.temperature_2m, data.current.wind_speed_10m);
  updatedAt.textContent = `${new Date(data.savedAt).toLocaleString()} · ${sourceLabel}`;

  showStatus("Listo.");
}

// -------------------- Cargar último guardado (offline-friendly) --------------------
function loadLast() {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLast(payload) {
  localStorage.setItem(LAST_KEY, JSON.stringify(payload));
}

const last = loadLast();
if (last) {
  render(last, "Guardado");
  showStatus(navigator.onLine ? "Mostrando último guardado (puedes consultar uno nuevo)." : "Sin internet: mostrando último guardado.");
} else if (!navigator.onLine) {
  showStatus("Sin internet y sin datos guardados. Conéctate y consulta una ciudad para habilitar offline.");
}

// -------------------- Lógica principal: buscar y consultar --------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  showStatus("Buscando ubicación…");
  resultEl.hidden = true;

  try {
    // 1) Geocoding
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=es&format=json`;
    const geoRes = await fetch(geoUrl, { cache: "no-store" });
    if (!geoRes.ok) throw new Error("Error consultando geocoding");
    const geo = await geoRes.json();

    if (!geo.results || geo.results.length === 0) {
      showStatus("No se encontró la ciudad. Prueba: 'Tijuana, MX' o 'San Diego, US'.");
      return;
    }

    const loc = geo.results[0];
    showStatus("Consultando clima…");

    // 2) Forecast actual (current)
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;

    const wRes = await fetch(forecastUrl, { cache: "no-store" });
    if (!wRes.ok) throw new Error("Error consultando clima");
    const weather = await wRes.json();

    const payload = {
      place: {
        name: loc.name,
        admin: loc.admin1 || "",
        country: loc.country_code || loc.country || ""
      },
      current: weather.current,
      savedAt: new Date().toISOString()
    };

    saveLast(payload);
    render(payload, "Online");
  } catch (err) {
    console.warn(err);

    const cached = loadLast();
    if (cached) {
      render(cached, "Offline (fallback)");
      showStatus("Sin conexión o error de API. Mostrando último clima guardado.");
    } else {
      showStatus("Ocurrió un error y no hay datos guardados. Revisa tu conexión e intenta de nuevo.");
    }
  }
});
