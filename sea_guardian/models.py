from __future__ import annotations
from datetime import datetime
from enum import Enum
from . import db

class Buoy(db.Model):
    __tablename__ = "buoys"
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(32), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120))
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    installed_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    readings = db.relationship("SensorReading", backref="buoy", lazy="dynamic", cascade="all, delete-orphan")
    events = db.relationship("EventLog", backref="buoy", lazy="dynamic", cascade="all, delete-orphan")
    leaks = db.relationship("LeakIncident", backref="buoy", lazy="dynamic")

class SensorReading(db.Model):
    __tablename__ = "sensor_readings"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    buoy_id = db.Column(db.Integer, db.ForeignKey("buoys.id"), index=True, nullable=False)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    turbidity = db.Column(db.Float)    # NTU
    ph = db.Column(db.Float)           # pH
    ec = db.Column(db.Float)           # PSU (approx salinity / conductivity)
    temperature = db.Column(db.Float)  # C (optional)
    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    status = db.Column(db.String(16), default="OK")  # OK/WARNING/ALERT

class EventLog(db.Model):
    __tablename__ = "event_logs"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    buoy_id = db.Column(db.Integer, db.ForeignKey("buoys.id"), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    level = db.Column(db.String(16))   # INFO/WARNING/ALERT
    message = db.Column(db.Text)

class LeakVolume(Enum):
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"

class LeakIncident(db.Model):
    __tablename__ = "leak_incidents"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    # optional: which buoy first detected it (nullable for manual placement)
    buoy_id = db.Column(db.Integer, db.ForeignKey("buoys.id"), index=True, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(16), default="active")  # active/resolved
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    volume = db.Column(db.Enum(LeakVolume, values_callable=lambda obj: [e.value for e in obj]), nullable=False)

    notes = db.Column(db.Text)

    # cached visualization scale for animation (meters)
    initial_radius_m = db.Column(db.Float, default=50.0)
    max_radius_m = db.Column(db.Float, default=1500.0)   # varies by volume
    spread_rate_mps = db.Column(db.Float, default=0.3)   # controls animation speed

class TrajectoryPoint(db.Model):
    __tablename__ = "trajectory_points"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    leak_id = db.Column(db.BigInteger, db.ForeignKey("leak_incidents.id"), index=True, nullable=False)
    seq = db.Column(db.Integer, index=True)          # order of the track
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    t_offset_s = db.Column(db.Integer, default=0)    # seconds from start
