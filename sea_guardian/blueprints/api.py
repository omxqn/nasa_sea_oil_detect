from __future__ import annotations
from flask import Blueprint, request, jsonify, abort
from datetime import datetime
from .. import db
from ..models import Buoy, SensorReading, EventLog, LeakIncident, LeakVolume, TrajectoryPoint

api_bp = Blueprint("api", __name__)

# -------------------- BUOYS --------------------

@api_bp.get("/buoys")
def buoys_list():
    items = Buoy.query.order_by(Buoy.device_id).all()
    return jsonify([{
        "id": b.id, "device_id": b.device_id, "name": b.name,
        "lat": b.lat, "lon": b.lon, "is_active": b.is_active
    } for b in items])

@api_bp.post("/buoys")
def buoys_create():
    data = request.get_json() or {}
    try:
        b = Buoy(
            device_id=data["device_id"],
            name=data.get("name"),
            lat=float(data["lat"]),
            lon=float(data["lon"]),
            is_active=True,
        )
    except KeyError as e:
        abort(400, f"missing field: {e.args[0]}")
    db.session.add(b)
    db.session.commit()
    return {"ok": True, "id": b.id}, 201

@api_bp.get("/buoys/<int:buoy_id>")
def buoy_detail(buoy_id):
    b = Buoy.query.get_or_404(buoy_id)
    readings = (SensorReading.query
                .filter_by(buoy_id=b.id)
                .order_by(SensorReading.recorded_at.desc())
                .limit(200)
                .all())
    return {
        "id": b.id, "device_id": b.device_id, "name": b.name, "lat": b.lat, "lon": b.lon,
        "readings": [{
            "id": r.id, "ts": r.recorded_at.isoformat(timespec="seconds"),
            "turbidity": r.turbidity, "ph": r.ph, "ec": r.ec, "temperature": r.temperature,
            "lat": r.lat, "lon": r.lon, "status": r.status
        } for r in readings]
    }

# -------------------- READINGS --------------------

@api_bp.post("/readings")
def ingest_reading():
    data = request.get_json() or {}

    # Validate device_id
    device_id = data.get("device_id")
    if not device_id:
        abort(400, "Missing 'device_id' in request body")

    buoy = Buoy.query.filter_by(device_id=device_id).first()
    if not buoy:
        abort(400, f"Unknown device_id: {device_id}")

    # Safely parse numeric fields
    def safe_float(key, default=None):
        try:
            return float(data.get(key, default))
        except (ValueError, TypeError):
            return default

    reading = SensorReading(
        buoy_id=buoy.id,
        turbidity=safe_float("turbidity"),
        ph=safe_float("ph"),
        ec=safe_float("ec"),
        temperature=safe_float("temperature"),
        lat=safe_float("lat", buoy.lat),
        lon=safe_float("lon", buoy.lon),
        status=data.get("status", "OK"),
    )

    db.session.add(reading)
    db.session.commit()
    return {"ok": True, "id": reading.id}, 201

# -------------------- LEAKS --------------------

def _volume_params(volume: LeakVolume):
    """Map leak volume to animation parameters."""
    if volume == LeakVolume.SMALL:
        return 30.0, 5000.0, 5.0
    if volume == LeakVolume.MEDIUM:
        return 50.0, 10000.0, 8.0
    return 80.0, 20000.0, 12.0  # LARGE

def _find_nearest_buoy(lat: float, lon: float) -> Buoy | None:
    """Rough nearest by Euclidean distance in degrees (fast and good enough here)."""
    return (Buoy.query
            .order_by((Buoy.lat - lat)*(Buoy.lat - lat) + (Buoy.lon - lon)*(Buoy.lon - lon))
            .first())

@api_bp.get("/leaks")
def leaks_list():
    q = LeakIncident.query.order_by(LeakIncident.created_at.desc())
    return jsonify([serialize_leak(x) for x in q.all()])

@api_bp.post("/leaks")
def leaks_create():
    data = request.get_json() or {}

    # 1️⃣ Validate volume
    vol = str(data.get("volume", "small")).lower()
    try:
        volume = LeakVolume(vol)
    except Exception:
        abort(400, "volume must be small|medium|large")

    # 2️⃣ Validate coordinates
    try:
        lat = float(data["lat"])
        lon = float(data["lon"])
    except KeyError as e:
        abort(400, f"Missing field: {e.args[0]}")
    except ValueError:
        abort(400, "lat/lon must be numbers")

    # 3️⃣ Resolve buoy association
    buoy_id = data.get("buoy_id")

    # Try to find nearest if not provided
    if not buoy_id:
        nearest = _find_nearest_buoy(lat, lon)
        if nearest:
            buoy_id = nearest.id
        else:
            # Fallback to first buoy in DB (never NULL)
            default_buoy = Buoy.query.first()
            if default_buoy:
                buoy_id = default_buoy.id
            else:
                abort(400, "No buoys found in database to attach leak")

    # 4️⃣ Volume parameters
    initial, maxr, rate = _volume_params(volume)

    # 5️⃣ Create leak record
    leak = LeakIncident(
        buoy_id=buoy_id,
        lat=lat,
        lon=lon,
        volume=volume,
        notes=data.get("notes", "Simulated leak"),
        initial_radius_m=initial,
        max_radius_m=maxr,
        spread_rate_mps=rate
    )
    db.session.add(leak)
    db.session.commit()

    print(f"✅ Leak created — buoy_id={buoy_id}, lat={lat}, lon={lon}")

    return {"ok": True, "id": leak.id, "leak": serialize_leak(leak)}, 201

@api_bp.get("/buoys/<int:buoy_id>/leaks")
def get_buoy_leaks(buoy_id):
    """Return leaks linked to this buoy."""
    leaks = (LeakIncident.query
             .filter_by(buoy_id=buoy_id)
             .order_by(LeakIncident.created_at.desc())
             .all())
    return jsonify([serialize_leak(l) for l in leaks])

@api_bp.post("/leaks/<int:leak_id>/resolve")
def leak_resolve(leak_id: int):
    leak = LeakIncident.query.get_or_404(leak_id)
    if leak.status != "resolved":
        leak.status = "resolved"
        leak.resolved_at = datetime.utcnow()
        db.session.commit()
    return {"ok": True, "leak": serialize_leak(leak)}


@api_bp.patch('/api/leaks/<int:leak_id>')
def update_leak(leak_id):
    leak = Leak.query.get_or_404(leak_id)
    data = request.json
    
    if 'status' in data:
        leak.status = data['status']
    
    if 'resolved_at' in data:
        leak.resolved_at = datetime.fromisoformat(data['resolved_at'].replace('Z', '+00:00'))
    
    db.session.commit()
    
    return jsonify({
        'id': leak.id,
        'status': leak.status,
        'message': 'Leak updated successfully'
    })


@api_bp.get("/leaks/<int:leak_id>/track")
def leak_track(leak_id: int):
    pts = (TrajectoryPoint.query
           .filter_by(leak_id=leak_id)
           .order_by(TrajectoryPoint.seq)
           .all())
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "LineString",
                         "coordinates": [[p.lon, p.lat] for p in pts]}
        }]
    }

# -------------------- SERIALIZER --------------------

def serialize_leak(l: LeakIncident):
    return {
        "id": l.id,
        "status": l.status,
        "created_at": l.created_at.isoformat(timespec="seconds"),
        "resolved_at": l.resolved_at.isoformat(timespec="seconds") if l.resolved_at else None,
        "lat": l.lat, "lon": l.lon,
        "volume": l.volume.value if hasattr(l.volume, "value") else str(l.volume),
        "initial_radius_m": l.initial_radius_m,
        "max_radius_m": l.max_radius_m,
        "spread_rate_mps": l.spread_rate_mps,
        "buoy_id": l.buoy_id,
        "notes": l.notes,
    }
