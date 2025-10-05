// Buoy Management Modal and Real-time Data Updates

let currentBuoyId = null;
let dataUpdateInterval = null;

// Function to open buoy management modal
function manageBuoy(buoyId) {
    currentBuoyId = buoyId;

    // Create modal if it doesn't exist
    if (!document.getElementById('buoyModal')) {
        createBuoyModal();
    }

    // Load buoy data and show modal
    loadBuoyData(buoyId);
    document.getElementById('buoyModal').style.display = 'block';

    // Start real-time data updates
    startDataUpdates();
}

// Create the modal HTML structure
function createBuoyModal() {
    const modalHTML = `
        <div id="buoyModal" class="modal" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="buoyTitle">إدارة العوامة</h2>
                    <span class="close" onclick="closeBuoyModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="buoy-info">
                        <div class="info-row">
                            <label>معرف العوامة:</label>
                            <span id="buoyDeviceId">--</span>
                        </div>
                        <div class="info-row">
                            <label>اسم العوامة:</label>
                            <span id="buoyName">--</span>
                        </div>
                        <div class="info-row">
                            <label>الموقع:</label>
                            <span id="buoyLocation">--</span>
                        </div>
                    </div>
                    
                    <div class="sensor-data">
                        <h3>بيانات المستشعرات (تحديث كل 5 ثوان)</h3>
                        <div class="sensor-grid">
                            <div class="sensor-card">
                                <div class="sensor-label">pH</div>
                                <div class="sensor-value" id="sensorPH">--</div>
                                <div class="sensor-status" id="statusPH">OK</div>
                            </div>
                            <div class="sensor-card">
                                <div class="sensor-label">EC (التوصيل الكهربائي)</div>
                                <div class="sensor-value" id="sensorEC">--</div>
                                <div class="sensor-status" id="statusEC">OK</div>
                            </div>
                            <div class="sensor-card">
                                <div class="sensor-label">العكارة (Turbidity)</div>
                                <div class="sensor-value" id="sensorTurbidity">--</div>
                                <div class="sensor-status" id="statusTurbidity">OK</div>
                            </div>
                            <div class="sensor-card">
                                <div class="sensor-label">الرطوبة (Moisture)</div>
                                <div class="sensor-value" id="sensorMoisture">--</div>
                                <div class="sensor-status" id="statusMoisture">OK</div>
                            </div>
                        </div>
                    </div>
                    <div class="leak-alerts">
                    <h3>تنبيهات التسريب</h3>
                    <div id="leakAlerts" class="alerts-container">
                        <p>لا توجد تنبيهات حتى الآن</p>
                    </div>
                </div>

                    <div class="data-history">
                        <h3>آخر القراءات</h3>
                        <div id="dataHistory" class="history-container">
                            <p>جاري تحميل البيانات...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add modal styles
    addModalStyles();
}


// Load leakage alerts for this buoy
function loadLeakAlerts(buoyId) {
    fetch(`/api/buoys/${buoyId}/leaks`)
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById("leakAlerts");

            if (!data || data.length === 0) {
                container.innerHTML = "<p>لا توجد تنبيهات مرتبطة بهذه العوامة</p>";
                return;
            }

            const alertsHTML = data.map(alert => {
                const ts = new Date(alert.ts).toLocaleString("ar-SA");
                return `
                    <div class="alert-entry ${alert.status === 'active' ? 'active' : 'resolved'}">
                        <div><strong>الحجم:</strong> ${alert.volume}</div>
                        <div><strong>الموقع:</strong> ${alert.lat.toFixed(3)}, ${alert.lon.toFixed(3)}</div>
                        <div><strong>الوقت:</strong> ${ts}</div>
                        <div><strong>الحالة:</strong> ${alert.status === 'active' ? '🟥 نشط' : '✅ محلول'}</div>
                    </div>
                `;
            }).join("");

            container.innerHTML = alertsHTML;
        })
        .catch(err => {
            console.error("Error loading leak alerts:", err);
        });
}




// Add CSS styles for the modal
function addModalStyles() {
    const styles = `
        <style>
        .modal {
            position: fixed;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        
        .modal-content {
            background-color: #fefefe;
            margin: 5% auto;
            padding: 0;
            border: none;
            border-radius: 8px;
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .modal-header {
            background: linear-gradient(135deg, #1e40af, #3b82f6);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
        }
        
        .close {
            color: white;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            line-height: 1;
        }
        
        .close:hover {
            opacity: 0.7;
        }
        
        .modal-body {
            padding: 20px;
        }
        
        .buoy-info {
            background: #f8fafc;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .info-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        
        .info-row label {
            font-weight: bold;
            color: #374151;
        }
        
        .sensor-data h3, .data-history h3 {
            color: #1f2937;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
        }
        
        .sensor-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        
        .sensor-card {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            transition: all 0.3s ease;
        }
        
        .sensor-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .sensor-label {
            font-size: 0.9rem;
            color: #6b7280;
            margin-bottom: 8px;
        }
        
        .sensor-value {
            font-size: 1.8rem;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .sensor-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .sensor-status.ok {
            background: #dcfce7;
            color: #166534;
        }
        
        .sensor-status.warning {
            background: #fef3c7;
            color: #92400e;
        }
        
        .sensor-status.alert {
            background: #fee2e2;
            color: #991b1b;
        }
        
        .history-container {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 15px;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .history-entry {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .history-entry:last-child {
            border-bottom: none;
        }
        
        .history-time {
            font-size: 0.9rem;
            color: #6b7280;
        }
        
        .history-values {
            font-size: 0.9rem;
            color: #374151;
        }
        
        .leak-alerts {
    margin-top: 20px;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    padding: 15px;
    border-radius: 6px;
}

    .alerts-container {
    max-height: 200px;
    overflow-y: auto;
    }
    
    .alert-entry {
    border-bottom: 1px solid #e5e7eb;
    padding: 8px 0;
    font-size: 0.9rem;
    }
    
    .alert-entry:last-child {
    border-bottom: none;
    }
    
    .alert-entry.active {
    color: #b91c1c;
    font-weight: bold;
    }
    
    .alert-entry.resolved {
    color: #166534;
    }

        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
}

// Load buoy data from API
function loadBuoyData(buoyId) {
    fetch(`/api/buoys/${buoyId}`)
        .then(response => response.json())
        .then(data => {
            // Update buoy info
            document.getElementById('buoyTitle').textContent = `إدارة العوامة - ${data.device_id}`;
            document.getElementById('buoyDeviceId').textContent = data.device_id;
            document.getElementById('buoyName').textContent = data.name || 'غير محدد';
            document.getElementById('buoyLocation').textContent = `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`;

            // Update history
            updateDataHistory(data.readings);
            loadLeakAlerts(buoyId);
        })
        .catch(error => {
            console.error('Error loading buoy data:', error);
        });
}

// Generate fake sensor data
function generateFakeSensorData() {
    const baseValues = {
        ph: 7.8 + (Math.random() - 0.5) * 1.0,
        ec: 35 + (Math.random() - 0.5) * 8,
        turbidity: 6 + (Math.random() - 0.5) * 4,
        moisture: 45 + (Math.random() - 0.5) * 20,
        temperature: 22 + (Math.random() - 0.5) * 6
    };

    // Add some variation to make it more realistic
    const time = Date.now() / 1000;
    baseValues.ph += Math.sin(time / 100) * 0.2;
    baseValues.ec += Math.cos(time / 150) * 2;
    baseValues.turbidity += Math.sin(time / 80) * 1;
    baseValues.moisture += Math.cos(time / 120) * 5;
    baseValues.temperature += Math.sin(time / 200) * 1.5;

    return baseValues;
}

// Send generated sensor data to the backend
function sendSensorData() {
    if (!currentBuoyId) return; // Ensure a buoy is selected

    const data = generateFakeSensorData();
    const buoyDeviceId = document.getElementById("buoyDeviceId").textContent;

    fetch("/api/readings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            device_id: buoyDeviceId,
            turbidity: data.turbidity,
            ph: data.ph,
            ec: data.ec,
            temperature: data.temperature, // Assuming temperature is also generated
            lat: parseFloat(document.getElementById("buoyLocation").textContent.split(",")[0]),
            lon: parseFloat(document.getElementById("buoyLocation").textContent.split(",")[1]),
            status: "OK", // Default status, can be refined based on thresholds
        }),
    })
    .then(response => response.json())
    .then(result => {
        if (result.ok) {
            console.log("Sensor data sent successfully:", result);
            // After sending, reload buoy data to get the latest readings from the DB
            loadBuoyData(currentBuoyId);
        } else {
            console.error("Failed to send sensor data:", result);
        }
    })
    .catch(error => {
        console.error("Error sending sensor data:", error);
    });
}

// Determine status based on sensor values
function getSensorStatus(type, value) {
    const thresholds = {
        ph: { warning: 8.5, alert: 9.0 },
        ec: { warning: 38, alert: 42 },
        turbidity: { warning: 8, alert: 12 },
        moisture: { warning: 65, alert: 75 }
    };

    const threshold = thresholds[type];
    if (value >= threshold.alert) return 'alert';
    if (value >= threshold.warning) return 'warning';
    return 'ok';
}

// Update sensor data display
function updateSensorData() {
    const data = generateFakeSensorData();

    // Update pH
    document.getElementById('sensorPH').textContent = data.ph.toFixed(2);
    const phStatus = getSensorStatus('ph', data.ph);
    const phStatusEl = document.getElementById('statusPH');
    phStatusEl.textContent = phStatus.toUpperCase();
    phStatusEl.className = `sensor-status ${phStatus}`;

    // Update EC
    document.getElementById('sensorEC').textContent = data.ec.toFixed(1) + ' PSU';
    const ecStatus = getSensorStatus('ec', data.ec);
    const ecStatusEl = document.getElementById('statusEC');
    ecStatusEl.textContent = ecStatus.toUpperCase();
    ecStatusEl.className = `sensor-status ${ecStatus}`;

    // Update Turbidity
    document.getElementById('sensorTurbidity').textContent = data.turbidity.toFixed(1) + ' NTU';
    const turbidityStatus = getSensorStatus('turbidity', data.turbidity);
    const turbidityStatusEl = document.getElementById('statusTurbidity');
    turbidityStatusEl.textContent = turbidityStatus.toUpperCase();
    turbidityStatusEl.className = `sensor-status ${turbidityStatus}`;

    // Update Moisture
    document.getElementById('sensorMoisture').textContent = data.moisture.toFixed(1) + '%';
    const moistureStatus = getSensorStatus('moisture', data.moisture);
    const moistureStatusEl = document.getElementById('statusMoisture');
    moistureStatusEl.textContent = moistureStatus.toUpperCase();
    moistureStatusEl.className = `sensor-status ${moistureStatus}`;
}

// Update data history display
function updateDataHistory(readings) {
    const historyContainer = document.getElementById('dataHistory');

    if (!readings || readings.length === 0) {
        historyContainer.innerHTML = '<p>لا توجد قراءات متاحة</p>';
        return;
    }

    const historyHTML = readings.slice(0, 10).map(reading => {
        const date = new Date(reading.ts);
        const timeStr = date.toLocaleString('ar-SA');

        return `
            <div class="history-entry">
                <div class="history-time">${timeStr}</div>
                <div class="history-values">
                    pH: ${reading.ph ? reading.ph.toFixed(2) : '--'} | 
                    EC: ${reading.ec ? reading.ec.toFixed(1) : '--'} | 
                    العكارة: ${reading.turbidity ? reading.turbidity.toFixed(1) : '--'}
                </div>
            </div>
        `;
    }).join('');

    historyContainer.innerHTML = historyHTML;
}

// Start real-time data updates
function startDataUpdates() {
    // Clear any existing interval
    if (dataUpdateInterval) {
        clearInterval(dataUpdateInterval);
    }

    // Update immediately
    updateSensorData();
    sendSensorData();

    // Set up interval for every 5 seconds
    dataUpdateInterval = setInterval(() => { updateSensorData(); sendSensorData(); }, 5000);
}

// Stop data updates
function stopDataUpdates() {
    if (dataUpdateInterval) {
        clearInterval(dataUpdateInterval);
        dataUpdateInterval = null;
    }
}

// Close modal function
function closeBuoyModal() {
    document.getElementById('buoyModal').style.display = 'none';
    stopDataUpdates();
    currentBuoyId = null;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('buoyModal');
    if (event.target === modal) {
        closeBuoyModal();
    }
}
window.manageBuoy = manageBuoy;
window.closeBuoyModal = closeBuoyModal;
window.manageBuoy = manageBuoy;
window.closeBuoyModal = closeBuoyModal;