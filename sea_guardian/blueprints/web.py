from __future__ import annotations
from flask import Blueprint, render_template, request
from ..models import Buoy, LeakIncident
from .. import db

web_bp = Blueprint("web", __name__)

@web_bp.get("/")
def dashboard():
    # Keep classes/layout like original index; we just split into pages.
    return render_template("dashboard.html")

@web_bp.get("/buoys/<int:buoy_id>")
def buoy_page(buoy_id: int):
    b = Buoy.query.get_or_404(buoy_id)
    return render_template("buoy_detail.html", buoy=b)

@web_bp.get("/leaks")
def leaks_page():
    leaks = LeakIncident.query.order_by(LeakIncident.created_at.desc()).all()
    return render_template("leaks.html", leaks=leaks)
