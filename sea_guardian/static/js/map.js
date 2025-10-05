// ======== MAP SETUP =========
window.dashboardMap = L.map('map', {
  center: [23.6, 58.6],
  zoom: 8,
  zoomControl: true,
  scrollWheelZoom: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(window.dashboardMap);

window.buoyMarkers = new Map();
window.buoyPositions = [];

// Load buoys
fetch('/api/buoys')
  .then(r => r.json())
  .then(items => {
    window.buoyPositions = items.map(b => ({
      id: b.id,
      device_id: b.device_id,
      lat: b.lat,
      lon: b.lon
    }));

    items.forEach(b => {
      const marker = L.circleMarker([b.lat, b.lon], {
        radius: 9,
        color: '#16a34a',
        weight: 2,
        fillOpacity: 0.9
      }).addTo(window.dashboardMap);

      const popupHTML = `
        <div style="text-align:center;min-width:160px;">
          <strong>العوامة: ${b.device_id}</strong><br><br>
          <button class="btn" style="background:#dc2626;color:white;font-weight:bold;border:none;" onclick="startLeakFromBuoy(${b.id}, ${b.lat}, ${b.lon})">بدء المحاكاة</button>
          <button class="btn" style="background:#16a34a;color:white;font-weight:bold;border:none;" onclick="resolveLeak(${b.id})">وضع الحل ✅</button>
          <button class="btn" style="margin:4px;" onclick="manageBuoy(${b.id})">إدارة</button>
        </div>`;
      marker.bindPopup(popupHTML);
      window.buoyMarkers.set(b.id, marker);
    });
  })
  .catch(console.error);

// Demo cards
function updateCards(){
  document.getElementById('avgTurb').textContent = (Math.random()*5+5).toFixed(2);
  document.getElementById('avgPh').textContent = (Math.random()*0.5+8).toFixed(2);
  document.getElementById('avgEc').textContent = (Math.random()*6+32).toFixed(2);
}

// ====== Toggle Night Mode ======
document.getElementById("toggleThemeBtn")?.addEventListener("click", () => {
  const body = document.body;
  const isDark = body.classList.toggle("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  document.getElementById("toggleThemeBtn").textContent = isDark ? "☀️ Day Mode" : "🌙 Night Mode";
});

// عند تحميل الصفحة استرجع الوضع السابق
window.addEventListener("load", () => {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("toggleThemeBtn").textContent = "☀️ Day Mode";
  }
});

updateCards();
setInterval(updateCards, 60000);
