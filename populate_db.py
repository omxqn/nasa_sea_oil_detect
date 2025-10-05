
from sea_guardian import create_app, db
from sea_guardian.models import Buoy

app = create_app()
with app.app_context():
    # Clear existing buoys to avoid duplicates during testing
    db.session.query(Buoy).delete()
    db.session.commit()

    BUOYS = [
        {"device_id":"B1","lat":23.60,"lon":58.50, "name": "Buoy Alpha"},
        {"device_id":"B2","lat":23.70,"lon":58.70, "name": "Buoy Beta"},
        {"device_id":"B3","lat":23.80,"lon":58.90, "name": "Buoy Gamma"},
    ]

    for b_data in BUOYS:
        buoy = Buoy(device_id=b_data["device_id"], name=b_data["name"], lat=b_data["lat"], lon=b_data["lon"])
        db.session.add(buoy)
    db.session.commit()
    print("Database populated with initial buoy data.")

