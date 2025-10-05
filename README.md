# 🌊 Sea-Guardian — AI-Powered Marine Pollution Monitoring System

### 🛰️ NASA Space Apps Challenge 2025 — Oman Team Submission

Sea-Guardian is an intelligent **marine pollution monitoring platform** that integrates **IoT buoys**, **AI-based analysis**, and **NASA open ocean data** to detect, track, and visualize oil spills and water quality degradation in real time.

The system simulates **fluid pollution spread** according to ocean currents, helping environmental authorities predict and respond to maritime hazards faster and more effectively.

---

## 🌍 Features

- **📡 Real-time IoT Buoy Data**
  - Each buoy collects pH, EC, turbidity, temperature, and other parameters.
  - Data is visualized dynamically through an interactive Leaflet map.

- **🌊 Fluid Simulation Engine**
  - Uses fake NASA-style current vectors (can be replaced with real datasets).
  - Simulates oil-like fluid spreading and drift direction using canvas animation.

- **🚨 Leak Detection & Alerts**
  - Automatic detection of simulated leaks.
  - Red “Leak Detected” status on dashboard + alert logs in buoy management.

- **🧠 AI & Data Integration**
  - Designed to support NASA OceanColor, HYCOM, and WINDsat open datasets.
  - Future-ready for predictive AI models for oil spill trajectory estimation.

- **🌓 Night Mode**
  - Optional dark UI theme for field and lab visualization comfort.

---

## 🏗️ System Architecture

```plaintext
         +-----------------------+
         |  Flask (Python API)   |
         |  /api/buoys, /leaks   |
         +----------+------------+
                    |
                    v
     +--------------------------------+
     |     SQLite / SQLAlchemy DB     |
     |  (Buoys, Readings, Leak Data)  |
     +--------------------------------+
                    ^
                    |
   +------------------------------------------+
   |        Frontend (Leaflet + Chart.js)     |
   |  HTML/CSS/JS — Realtime dashboard UI     |
   +------------------------------------------+
