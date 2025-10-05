# app.py
# -*- coding: utf-8 -*-
"""
Sea-Guardian Backend — Flask API
يشغّل:
- /simulate/forward  : محاكاة انتشار للأمام (oil drift)
- /simulate/backward : محاكاة رجوع للخلف لتقدير مصدر التلوث
- /currents          : متجهات تيار موجزة للخريطة (أسهم)
- /buoys, /data, /events, /trajectory : بيانات تكامل مع الواجهة

المحاكاة: Lagrangian particle tracking:
   dx/dt = u_current + α * u_wind + RandomWalk(diffusion)

مصادر البيانات (اختياري إن توفر اتصال واعتماد Earthdata):
- NASA ECCO (أسطح التيارات U/V)
- MERRA-2 (رياح سطحية U10/V10)
وإلا فالسكربت يولّد حقولًا اصطناعية معقولة لتشغيل النظام.

إعدادات بيئية:
- EARTHDATA_TOKEN=xxxxxxxx (إذا أردت الجلب من Internet)
"""

from __future__ import annotations
import os, json, math, time, random, datetime as dt
from typing import Dict, Any, List, Tuple, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS

import numpy as np

# xarray/NetCDF للبيانات الفعلية (يُستخدم إن توفرت ملفات أو اتصال)
try:
    import xarray as xr
except Exception:
    xr = None

# ========================= إعدادات عامة =========================
APP_TITLE = "Sea Guardian API"
DATA_DIR   = os.path.join(os.path.dirname(__file__), "data")
NASA_DIR   = os.path.join(DATA_DIR, "nasa")
os.makedirs(NASA_DIR, exist_ok=True)

DEFAULT_LAT = 23.600
DEFAULT_LON = 58.500
DEFAULT_HOURS = 48
DEFAULT_PARTICLES = 8000

# النطاق المكاني (خليج عمان تقريبًا)
DOMAIN = dict(lat_min=22.5, lat_max=26.0, lon_min=56.5, lon_max=60.5)

# زمن خطوة التكامل (ثواني)
DT_SECONDS = 600.0  # 10 دقائق
# عدد خطوات السجل الذي نعيده على هيئة Polyline (تجميع)
SAMPLE_EVERY_STEPS = 3

# ========================= أدوات مساعدة =========================
def clamp(v, a, b):
    return max(a, min(b, v))

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2-lat1)
    dlon = math.radians(lon2-lon1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2)
    return 2*R*math.asin(math.sqrt(a))

def seed_rng(seed=None):
    if seed is None:
        seed = int(time.time()*1000) & 0xffffffff
    rng = np.random.default_rng(seed)
    return rng

# ========================= جلب/تحميل بيانات ناسا =========================
# ملاحظة: لتسهيل التشغيل بدون إنترنت/اعتماد، سنوفّر fallback يولّد حقولاً اصطناعية
EARTHDATA_TOKEN = os.environ.get("EARTHDATA_TOKEN", "").strip()

def _have_earthdata():
    return bool(EARTHDATA_TOKEN)

def _headers_earthdata():
    return {"Authorization": f"Bearer {EARTHDATA_TOKEN}"} if _have_earthdata() else {}

# يمكنك وضع مسارات ملفات NetCDF محلية هنا إن كانت جاهزة
ECCO_UV_FILE = os.path.join(NASA_DIR, "ecco_uv_surface.nc")  # مثلاً: u,v على الزمن
MERRA_WIND_FILE = os.path.join(NASA_DIR, "merra2_wind10m.nc")  # u10,v10 على الزمن

def load_ecco_uv() -> Optional[Any]:
    """
    يحاول فتح ملف ECCO المحلي. إن لم يتوفر أو xarray غير متاح → None.
    يجب أن يحتوي على متغيرات u, v بأبعاد (time, lat, lon) وعلى إحداثيات lat, lon, time.
    """
    if xr is None: return None
    if os.path.exists(ECCO_UV_FILE):
        try:
            ds = xr.open_dataset(ECCO_UV_FILE)
            # تأكد من الأسماء
            for k in ("u","v","lat","lon","time"):
                if k not in ds.variables and k not in ds.coords:
                    raise ValueError("Missing variable in ECCO file: "+k)
            return ds
        except Exception:
            return None
    return None

def load_merra2_wind() -> Optional[Any]:
    """
    يحاول فتح ملف ريح MERRA-2 المحلي (u10, v10).
    """
    if xr is None: return None
    if os.path.exists(MERRA_WIND_FILE):
        try:
            ds = xr.open_dataset(MERRA_WIND_FILE)
            for k in ("u10","v10","lat","lon","time"):
                if k not in ds.variables and k not in ds.coords:
                    raise ValueError("Missing variable in MERRA file: "+k)
            return ds
        except Exception:
            return None
    return None

# ========================= حقول اصطناعية واقعية =========================
class SyntheticFields:
    """
    حقول تيار/ريح اصطناعية لكن واقعية السلوك:
    - تيارات دورانية ضعيفة + اندفاع ساحلي
    - رياح جنوبية-شرقية معتدلة
    """
    def __init__(self, domain=DOMAIN):
        self.lat_min = domain["lat_min"]
        self.lat_max = domain["lat_max"]
        self.lon_min = domain["lon_min"]
        self.lon_max = domain["lon_max"]

    def uv_current(self, lat, lon, tsec) -> Tuple[float,float]:
        # نمط دوّار بسيط + موجة زمنية خفيفة
        # السرعة بالمتر/ثانية على السطح
        # حوّل lat/lon إلى نسب داخل المجال
        ly = (lat - self.lat_min)/(self.lat_max - self.lat_min + 1e-9)
        lx = (lon - self.lon_min)/(self.lon_max - self.lon_min + 1e-9)
        base = 0.25  # m/s
        u = base*( math.sin(2*math.pi*lx) * math.cos(2*math.pi*ly) ) * (1+0.1*math.sin(2*math.pi*tsec/86400))
        v = base*( -math.cos(2*math.pi*lx) * math.sin(2*math.pi*ly) ) * (1+0.1*math.cos(2*math.pi*tsec/86400))
        # اندفاع ساحلي خفيف شرق->غرب
        u += 0.05*math.cos(2*math.pi*ly)
        return (u, v)

    def uv_wind10m(self, lat, lon, tsec) -> Tuple[float,float]:
        # رياح جنوبية-شرقية ثابتة تقريبًا + تذبذب يومي
        speed = 4.0 + 1.0*math.sin(2*math.pi*tsec/86400)  # m/s
        # اتجاه جنوب-شرق (u موجب شرقًا، v موجب شمالًا) → من الجنوب الشرقي للغرب والشمال؟ لنبسّط:
        # خذ اتجاه 45° (نحو الشمال الشرقي) كمتجه (u=cos, v=sin) وعدّل
        direction_rad = math.radians(60.0)
        u = speed*math.cos(direction_rad)
        v = speed*math.sin(direction_rad)
        return (u, v)

SYN = SyntheticFields()

# ========================= استيفاء حقول xarray (إن توفرت) =========================
def bilinear_interpolate(arr2d, x, y):
    """
    arr2d: مصفوفة shape (ny, nx)
    x,y: إحداثيات float (مؤشر داخل الشبكة)
    يعيد قيمة ثنائية الخطيّة.
    """
    x0 = int(np.floor(x)); x1 = x0 + 1
    y0 = int(np.floor(y)); y1 = y0 + 1
    x0 = clamp(x0, 0, arr2d.shape[1]-1); x1 = clamp(x1, 0, arr2d.shape[1]-1)
    y0 = clamp(y0, 0, arr2d.shape[0]-1); y1 = clamp(y1, 0, arr2d.shape[0]-1)
    q11 = arr2d[y0, x0]; q21 = arr2d[y0, x1]
    q12 = arr2d[y1, x0]; q22 = arr2d[y1, x1]
    dx = x - x0; dy = y - y0
    return (q11*(1-dx)*(1-dy) + q21*dx*(1-dy) + q12*(1-dx)*dy + q22*dx*dy)

def sample_from_dataset(ds, varname, lat, lon, tindex) -> float:
    """
    ds: xarray Dataset
    varname: اسم المتغيّر (u, v, u10, v10)
    يفترض أن ds[varname] أبعاده (time, lat, lon) بالترتيب.
    """
    v = ds[varname].isel(time=tindex)
    lats = ds["lat"].values
    lons = ds["lon"].values
    # افترض lat تصاعدي و lon تصاعدي
    iy = np.searchsorted(lats, lat) - 1
    ix = np.searchsorted(lons, lon) - 1
    iy = clamp(iy, 0, len(lats)-2)
    ix = clamp(ix, 0, len(lons)-2)
    # اصنع x,y نسبية داخل الخلية
    x = ix + (lon - lons[ix]) / max(lons[ix+1] - lons[ix], 1e-9)
    y = iy + (lat - lats[iy]) / max(lats[iy+1] - lats[iy], 1e-9)
    arr2d = v.values  # (lat, lon)
    return float(bilinear_interpolate(arr2d, x, y))

class FieldProvider:
    """
    يوفّر دوال: current(lat,lon,t) و wind(lat,lon,t)
    إما من xarray (إن توفرت) أو synthetic fallback.
    """
    def __init__(self):
        self.ds_ecco = load_ecco_uv()
        self.ds_merra = load_merra2_wind()
        # إذا datasets موجودة، جهّز فهارس زمنيّة
        self.tidx_ecco = 0
        self.tidx_merra = 0

    def current_uv(self, lat, lon, tsec) -> Tuple[float,float]:
        if self.ds_ecco is not None:
            # نأخذ أول وقت متاح (أو استخدم near-time لاحقاً)
            try:
                u = sample_from_dataset(self.ds_ecco, "u", lat, lon, self.tidx_ecco)
                v = sample_from_dataset(self.ds_ecco, "v", lat, lon, self.tidx_ecco)
                return (u, v)
            except Exception:
                pass
        return SYN.uv_current(lat, lon, tsec)

    def wind10m_uv(self, lat, lon, tsec) -> Tuple[float,float]:
        if self.ds_merra is not None:
            try:
                u = sample_from_dataset(self.ds_merra, "u10", lat, lon, self.tidx_merra)
                v = sample_from_dataset(self.ds_merra, "v10", lat, lon, self.tidx_merra)
                return (u, v)
            except Exception:
                pass
        return SYN.uv_wind10m(lat, lon, tsec)

FIELDS = FieldProvider()

# ========================= محرك المحاكاة =========================
def simulate_particles(lat0, lon0, hours=DEFAULT_HOURS, n=DEFAULT_PARTICLES,
                       windage=0.02, diff_m2s=0.5, backward=False,
                       seed=None) -> Dict[str, Any]:
    """
    محاكاة Lagrangian بسيطة:
    - نطلق n جسيمًا حول نقطة (lat0,lon0) بتشتّت ابتدائي صغير
    - كل خطوة dt: x += (u_curr + windage*u_wind)*dt + random_walk
    - random_walk (m) يحوّل إلى درجات lat/lon (تقريب)
    - إن backward=True: dt ← -dt
    يعاد:
      - "mean_track": polyline (lon,lat) لمتوسط الجسيمات عبر الزمن
      - "final_cloud": سحابة نقاط أخيرة للجسيمات
    """
    rng = seed_rng(seed)

    # تهيئة الجسيمات حول النقطة (تشتت ابتدائي ~ 100م)
    lat = np.full((n,), lat0, dtype=float) + rng.normal(0.0, 0.001, size=n)
    lon = np.full((n,), lon0, dtype=float) + rng.normal(0.0, 0.001, size=n)

    steps = int(abs(hours*3600/DT_SECONDS))
    dt_sec = -DT_SECONDS if backward else DT_SECONDS

    mean_track: List[Tuple[float,float]] = []
    # ثوابت تحويل تقريبية من متر إلى درجة
    meters_per_deg_lat = 111_000.0
    def meters_to_deg_lat(d): return d/meters_per_deg_lat
    def meters_to_deg_lon(d, lat_): return d/(meters_per_deg_lat*math.cos(math.radians(lat_))+1e-9)

    sample_accum = 0
    t0 = 0.0  # يمكن استخدام وقت فعلي إن رغبت
    for k in range(steps):
        tsec = t0 + k*dt_sec

        # استخرج الحقول لكل جسيم (يمكن تسريعها بالتجميع)
        u_c = np.zeros(n); v_c = np.zeros(n)
        u_w = np.zeros(n); v_w = np.zeros(n)
        for i in range(n):
            uc, vc = FIELDS.current_uv(lat[i], lon[i], tsec)
            uw, vw = FIELDS.wind10m_uv(lat[i], lon[i], tsec)
            u_c[i] = uc; v_c[i] = vc
            u_w[i] = uw; v_w[i] = vw

        # السرعات الكلية (م/ث)
        u = u_c + windage*u_w
        v = v_c + windage*v_w

        # خطوة عشوائية (Random Walk) لتقليد التشتت (diffusion)
        # σ = sqrt(2*D*dt)
        sigma = math.sqrt(max(2.0*diff_m2s*abs(dt_sec), 1e-12))
        dx_rand = rng.normal(0.0, sigma, size=n)   # بالمتر شرق/غرب
        dy_rand = rng.normal(0.0, sigma, size=n)   # بالمتر شمال/جنوب

        # حدّث المواقع (بالدرجات)
        # ملاحظة: u (شرق+) يعادل dx/dt بالمتر/ثانية
        lon += meters_to_deg_lon(u*dt_sec + dx_rand, lat)
        lat += meters_to_deg_lat(v*dt_sec + dy_rand)

        # إبقِ الجسيمات ضمن الدومين بشكل لطيف (قص)
        lat = np.clip(lat, DOMAIN["lat_min"], DOMAIN["lat_max"])
        lon = np.clip(lon, DOMAIN["lon_min"], DOMAIN["lon_max"])

        # خزّن المسار المتوسط كل عدة خطوات لتخفيف الحجم
        sample_accum += 1
        if sample_accum >= SAMPLE_EVERY_STEPS:
            sample_accum = 0
            mean_track.append((float(np.mean(lon)), float(np.mean(lat))))

    if not mean_track:
        mean_track = [(lon0, lat0)]

    result = {
        "mean_track": mean_track,  # [(lon,lat), ...]
        "final_cloud": list(zip(lon.tolist(), lat.tolist()))
    }
    return result

def to_geojson_linestring(coords: List[Tuple[float,float]]) -> Dict[str, Any]:
    return {
      "type":"FeatureCollection",
      "features":[{"type":"Feature",
                   "properties":{},
                   "geometry":{"type":"LineString","coordinates":coords}}]
    }

# ========================= سيرفر Flask =========================
app = Flask(__name__)
CORS(app)

# ---- بيانات تكامل للواجهة (تجريبية) ----
BUOYS = [
    {"device_id":"B1","lat":23.60,"lon":58.50},
    {"device_id":"B2","lat":23.70,"lon":58.70},
    {"device_id":"B3","lat":23.80,"lon":58.90},
]

# آخر قراءة لكل عوامة (تجريبي)
def synth_status(turbidity, ph, ec):
    if turbidity>10 or ph>9 or ec>40: return "ALERT"
    if turbidity>7.5 or ph>8.5 or ec>36: return "WARNING"
    return "OK"

def latest_data():
    now = dt.datetime.utcnow()
    rows = []
    base = [
        ("B1", 23.60, 58.50, 5.5, 7.9, 32),
        ("B2", 23.70, 58.70, 8.2, 8.1, 36),
        ("B3", 23.80, 58.90, 12.0, 9.2, 42),
    ]
    for did, la, lo, tb, ph, ec in base:
        rows.append({
            "time": now.strftime("%Y-%m-%d %H:%M"),
            "device_id": did,
            "lat": la, "lon": lo,
            "turbidity": tb, "ph": ph, "ec": ec,
            "status": synth_status(tb, ph, ec)
        })
    return rows

EVENTS = [
    {"time":"2025-10-04 12:00","device_id":"B2","turbidity":8.2,"ph":8.1,"ec":36,"status":"WARNING"},
    {"time":"2025-10-04 12:05","device_id":"B3","turbidity":12,"ph":9.2,"ec":42,"status":"ALERT"},
]

@app.route("/")
def root():
    return jsonify({"title": APP_TITLE, "ok": True})

@app.route("/buoys")
def api_buoys():
    return jsonify(BUOYS)

@app.route("/data")
def api_data():
    return jsonify(latest_data())

@app.route("/events")
def api_events():
    return jsonify(EVENTS)

@app.route("/trajectory")
def api_trajectory():
    did = request.args.get("device_id","B1")
    # مسار قصير تجريبي للعوامة
    if did == "B1":
        path = [(23.60,58.50),(23.62,58.55),(23.65,58.60)]
    elif did == "B2":
        path = [(23.70,58.70),(23.71,58.66),(23.72,58.62)]
    else:
        path = [(23.80,58.90),(23.82,58.92),(23.84,58.96)]
    # الواجهة تتوقع [lat,lon] لذا نعيد بنفس الترتيب:
    return jsonify([[lat,lon] for (lat,lon) in path])

@app.route("/currents")
def api_currents():
    """
    نعيد عيّنة أسهم تيار للخريطة (lat,lon,u,v).
    """
    out = []
    rows = 8; cols = 10
    tsec = 0.0
    for iy in range(rows):
        lat = DOMAIN["lat_min"] + (iy+0.5)*(DOMAIN["lat_max"]-DOMAIN["lat_min"])/rows
        for ix in range(cols):
            lon = DOMAIN["lon_min"] + (ix+0.5)*(DOMAIN["lon_max"]-DOMAIN["lon_min"])/cols
            u,v = FIELDS.current_uv(lat, lon, tsec)
            out.append({"lat":lat,"lon":lon,"u":u,"v":v})
    return jsonify(out)

# ---- محاكاة التقديم/الإرجاع ----
def parse_float(qs, key, default):
    try: return float(qs.get(key, default))
    except: return default

def parse_int(qs, key, default):
    try: return int(qs.get(key, default))
    except: return default

@app.route("/simulate/forward")
def api_forward():
    args = request.args
    lat  = parse_float(args,"lat", DEFAULT_LAT)
    lon  = parse_float(args,"lon", DEFAULT_LON)
    hrs  = parse_float(args,"hours", DEFAULT_HOURS)
    n    = parse_int(args,"n", DEFAULT_PARTICLES)
    wind = parse_float(args,"windage", 0.02)
    diff = parse_float(args,"diff", 0.5)

    sim = simulate_particles(lat, lon, hours=hrs, n=n, windage=wind, diff_m2s=diff, backward=False)
    # الواجهة تستخدم GeoJSON LineString (lon,lat)
    return jsonify(to_geojson_linestring(sim["mean_track"]))

@app.route("/simulate/backward")
def api_backward():
    args = request.args
    lat  = parse_float(args,"lat", DEFAULT_LAT)
    lon  = parse_float(args,"lon", DEFAULT_LON)
    hrs  = parse_float(args,"hours", DEFAULT_HOURS)
    n    = parse_int(args,"n", DEFAULT_PARTICLES)
    wind = parse_float(args,"windage", 0.02)
    diff = parse_float(args,"diff", 0.5)

    sim = simulate_particles(lat, lon, hours=hrs, n=n, windage=wind, diff_m2s=diff, backward=True)
    return jsonify(to_geojson_linestring(sim["mean_track"]))

# ========================= تشغيل =========================
if __name__ == "__main__":
    print(f"{APP_TITLE} is running on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)
