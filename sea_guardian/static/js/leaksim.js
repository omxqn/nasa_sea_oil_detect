// ======== ADVANCED FLUID LEAK SIMULATION WITH REALISTIC OCEAN DYNAMICS =========
(function () {
  const map = window.dashboardMap;
  if (!map) return console.error("Map not found");

  const volumeSel = document.getElementById('leakVolume');
  const stateBox = document.getElementById('stateBox');
  let active = null;

  // Enhanced ocean current data with seasonal variations and depth layers
  function getOceanCurrent(lat, lon, depth = 0) {
    // Time-based variation (simulating tidal and seasonal effects)
    const time = Date.now() / 10000; // slow time progression
    const tidalFactor = Math.sin(time) * 0.3;
    
    const patterns = [
      // Arabian Gulf - strong counterclockwise gyre
      { latMin: 24, latMax: 30, lonMin: 48, lonMax: 57, 
        vx: -0.4 + Math.cos(time * 0.5) * 0.2, 
        vy: 0.25 + Math.sin(time * 0.5) * 0.15, 
        strength: 0.9, turbulence: 0.3 },
      // Strait of Hormuz - strong narrow flow
      { latMin: 25.5, latMax: 27, lonMin: 55.5, lonMax: 57, 
        vx: 0.6, vy: -0.1, strength: 1.2, turbulence: 0.5 },
      // Gulf of Oman - eastward coastal current
      { latMin: 23, latMax: 26, lonMin: 57, lonMax: 62, 
        vx: 0.5 + tidalFactor, vy: -0.15, strength: 0.8, turbulence: 0.25 },
      // Red Sea - thermocline circulation
      { latMin: 15, latMax: 30, lonMin: 32, lonMax: 44, 
        vx: 0.05 + Math.sin(lat * 0.2) * 0.15, 
        vy: 0.6 + Math.cos(lon * 0.1) * 0.2, 
        strength: 0.7, turbulence: 0.2 },
      // South China Sea - monsoon-driven
      { latMin: 18, latMax: 26, lonMin: 110, lonMax: 120, 
        vx: 0.3 + Math.sin(time * 0.3) * 0.25, 
        vy: 0.4, strength: 0.65, turbulence: 0.35 },
      // Gulf of Mexico - Loop Current
      { latMin: 20, latMax: 30, lonMin: -98, lonMax: -82, 
        vx: -0.3 + Math.cos(lat * 0.3) * 0.4, 
        vy: 0.5 + Math.sin(lon * 0.2) * 0.3, 
        strength: 0.85, turbulence: 0.4 },
      // North Pacific - Kuroshio extension
      { latMin: 45, latMax: 60, lonMin: 160, lonMax: -160, 
        vx: 0.7, vy: -0.25, strength: 1.1, turbulence: 0.3 }
    ];

    for (const p of patterns) {
      if (lat >= p.latMin && lat <= p.latMax && 
          lon >= p.lonMin && lon <= p.lonMax) {
        
        // Depth effects (surface vs subsurface)
        const depthFactor = Math.exp(-depth * 0.3);
        
        // Turbulent eddies
        const eddyScale = 0.1;
        const eddyX = Math.sin(lat * 10 + lon * 8 + time) * eddyScale;
        const eddyY = Math.cos(lat * 8 + lon * 10 + time) * eddyScale;
        
        return {
          vx: (p.vx + eddyX) * p.strength * depthFactor,
          vy: (p.vy + eddyY) * p.strength * depthFactor,
          turbulence: p.turbulence
        };
      }
    }

    // Default complex background flow
    const bgX = Math.sin(lat * 0.3 + time * 0.2) * 0.2;
    const bgY = Math.cos(lon * 0.3 + time * 0.2) * 0.2;
    return { vx: bgX, vy: bgY, turbulence: 0.15 };
  }

  function toast(msg, color = '#dc2626') {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'absolute', top: '20px', left: '50%',
      transform: 'translateX(-50%)', background: color,
      color: '#fff', padding: '10px 24px', borderRadius: '10px',
      fontWeight: '700', boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
      zIndex: 2000, transition: 'opacity 0.4s', opacity: '1'
    });
    document.getElementById("map").appendChild(t);
    setTimeout(() => { 
      t.style.opacity = '0'; 
      setTimeout(() => t.remove(), 400); 
    }, 2500);
  }

  function setAlertState() {
    if (!stateBox) return;
    stateBox.textContent = 'LEAK DETECTED';
    stateBox.classList.remove('ok');
    stateBox.classList.add('alert');
  }

  function setOkState() {
    if (!stateBox) return;
    stateBox.textContent = 'OK';
    stateBox.classList.remove('alert');
    stateBox.classList.add('ok');
  }

  // Advanced particle with oil properties
  class OilParticle {
    constructor(lat, lon, age = 0, depth = 0) {
      this.lat = lat;
      this.lon = lon;
      this.age = age;
      this.depth = depth; // 0 = surface, 1 = subsurface
      this.maxAge = 180 + Math.random() * 60; // variable lifetime
      this.velocity = { vx: 0, vy: 0 };
      this.mass = 0.5 + Math.random() * 0.5; // affects inertia
      this.marker = null;
      this.concentration = 1.0; // degradation over time
      
      // Oil weathering properties
      this.evaporationRate = 0.002;
      this.dispersalRate = 0.001;
    }

    update() {
      const current = getOceanCurrent(this.lat, this.lon, this.depth);
      
      // Momentum-based movement (heavier particles respond slower)
      const inertia = 0.85 - (this.mass * 0.15);
      this.velocity.vx = this.velocity.vx * inertia + current.vx * (1 - inertia);
      this.velocity.vy = this.velocity.vy * inertia + current.vy * (1 - inertia);

      // Turbulent diffusion (stronger in high turbulence zones)
      const turbDiffusion = current.turbulence || 0.15;
      const diffusionX = (Math.random() - 0.5) * turbDiffusion * 0.1;
      const diffusionY = (Math.random() - 0.5) * turbDiffusion * 0.1;
      
      // Shear dispersion (velocity gradient effects)
      const shearX = Math.sin(this.lat * 5) * 0.02;
      const shearY = Math.cos(this.lon * 5) * 0.02;

      // Wind drift for surface particles (3% of wind speed)
      const windDrift = this.depth === 0 ? 0.03 : 0;
      const windX = Math.cos(Date.now() / 15000) * windDrift;
      const windY = Math.sin(Date.now() / 15000) * windDrift;

      // Combine all forces
      this.velocity.vx += diffusionX + shearX + windX;
      this.velocity.vy += diffusionY + shearY + windY;

      // Update position with realistic scaling
      // ~0.001 degrees ≈ 100m movement per frame at moderate current
      const speedScale = 0.0015;
      this.lat += this.velocity.vy * speedScale;
      this.lon += this.velocity.vx * speedScale;

      // Oil weathering processes
      this.concentration *= (1 - this.evaporationRate);
      this.concentration *= (1 - this.dispersalRate);
      
      // Vertical mixing (particles can sink/float)
      if (Math.random() < 0.01) {
        this.depth = Math.max(0, Math.min(1, this.depth + (Math.random() - 0.5) * 0.3));
      }

      this.age++;
      
      // Update visual representation
      if (this.marker) {
        const lifeFactor = 1 - (this.age / this.maxAge);
        const opacity = lifeFactor * this.concentration * (this.depth === 0 ? 0.7 : 0.4);
        const radius = 2.5 + (1 - lifeFactor) * 3 + this.mass * 1.5;
        
        // Color changes as oil weathers
        const freshness = this.concentration;
        const color = freshness > 0.7 ? '#1a1a1a' : 
                      freshness > 0.4 ? '#4a3020' : '#8b6f47';
        
        this.marker.setLatLng([this.lat, this.lon]);
        this.marker.setStyle({
          fillOpacity: opacity,
          radius: radius,
          fillColor: color,
          color: color,
          weight: 0.5
        });
      }
    }

    isDead() {
      return this.age >= this.maxAge || this.concentration < 0.1;
    }

    createMarker() {
      this.marker = L.circleMarker([this.lat, this.lon], {
        radius: 3,
        color: '#1a1a1a',
        weight: 0.5,
        fillColor: '#1a1a1a',
        fillOpacity: 0.7
      }).addTo(map);
    }

    remove() {
      if (this.marker) map.removeLayer(this.marker);
    }
  }

  // Particle cluster for realistic grouping - fixed size, moves with fluid
  class ParticleCluster {
    constructor(lat, lon, size) {
      this.centerLat = lat;
      this.centerLon = lon;
      this.particles = [];
      this.size = size;
      this.polygon = null;
      this.fixedSpread = 0.015; // Fixed size ~1.5km radius
      this.createClusterVisual();
    }

    createClusterVisual() {
      // Create a semi-transparent polygon showing oil sheen - fixed size
      const bounds = [
        [this.centerLat + this.fixedSpread, this.centerLon + this.fixedSpread],
        [this.centerLat + this.fixedSpread, this.centerLon - this.fixedSpread],
        [this.centerLat - this.fixedSpread, this.centerLon - this.fixedSpread],
        [this.centerLat - this.fixedSpread, this.centerLon + this.fixedSpread]
      ];
      
      this.polygon = L.polygon(bounds, {
        color: '#2a2a2a',
        fillColor: '#1a1a1a',
        fillOpacity: 0.15,
        weight: 1,
        opacity: 0.3
      }).addTo(map);
    }

    update() {
      if (this.particles.length === 0) return;
      
      // Update cluster center based on particle positions (moves with fluid)
      let sumLat = 0, sumLon = 0, count = 0;
      this.particles.forEach(p => {
        if (!p.isDead()) {
          sumLat += p.lat;
          sumLon += p.lon;
          count++;
        }
      });
      
      if (count > 0) {
        this.centerLat = sumLat / count;
        this.centerLon = sumLon / count;
        
        // Update polygon position only - keep same size
        const bounds = [
          [this.centerLat + this.fixedSpread, this.centerLon + this.fixedSpread],
          [this.centerLat + this.fixedSpread, this.centerLon - this.fixedSpread],
          [this.centerLat - this.fixedSpread, this.centerLon - this.fixedSpread],
          [this.centerLat - this.fixedSpread, this.centerLon + this.fixedSpread]
        ];
        this.polygon.setLatLngs(bounds);
        
        // Opacity based on particle concentration
        const opacity = Math.min(0.25, count / 200);
        this.polygon.setStyle({ fillOpacity: opacity });
      }
    }

    remove() {
      if (this.polygon) map.removeLayer(this.polygon);
    }
  }

  window.startLeakFromBuoy = function (id, lat, lon) {
    const vol = (volumeSel && volumeSel.value) || 'medium';
    const sizeParams = { 
      small: { count: 250, maxRadius: 5000, spawnRate: 8 }, 
      medium: { count: 500, maxRadius: 10000, spawnRate: 12 }, 
      large: { count: 800, maxRadius: 20000, spawnRate: 18 } 
    };
    const params = sizeParams[vol] || sizeParams.medium;

    if (active && active.raf) cancelAnimationFrame(active.raf);
    if (active) {
      active.particles.forEach(p => p.remove());
      if (active.cluster) active.cluster.remove();
    }

    const cluster = new ParticleCluster(lat, lon, params.maxRadius);

    active = {
      particles: [],
      cluster: cluster,
      startTime: performance.now(),
      raf: null,
      hitSet: new Set(),
      lat, lon,
      maxRadius: params.maxRadius,
      particleCount: params.count,
      spawnRate: params.spawnRate,
      spawnCounter: 0
    };

    toast(`💧 بدء محاكاة التسرب الواقعية عند العوامة ${id}`, '#0F4C81');
    tick();
  };

  function tick() {
    if (!active) return;

    const elapsed = performance.now() - active.startTime;
    const spawnPhase = Math.min(elapsed / 12000, 1); // 12 second spawn
    
    // Multi-phase release (initial burst + sustained leak)
    if (spawnPhase < 1) {
      const burstFactor = spawnPhase < 0.1 ? 3 : 1; // initial burst
      const currentSpawnRate = Math.floor(active.spawnRate * burstFactor * (1 - spawnPhase));
      
      for (let i = 0; i < currentSpawnRate; i++) {
        if (active.particles.length < active.particleCount) {
          // Spawn in realistic pattern (plume dispersion)
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 0.003;
          const offsetLat = Math.cos(angle) * radius;
          const offsetLon = Math.sin(angle) * radius;
          
          // Some particles at different depths
          const depth = Math.random() < 0.7 ? 0 : Math.random() * 0.5;
          
          const particle = new OilParticle(
            active.lat + offsetLat, 
            active.lon + offsetLon,
            Math.floor(Math.random() * 30),
            depth
          );
          particle.createMarker();
          active.particles.push(particle);
          active.cluster.particles.push(particle);
        }
      }
    }

    // Update all particles
    for (let i = active.particles.length - 1; i >= 0; i--) {
      const p = active.particles[i];
      p.update();
      
      if (p.isDead()) {
        p.remove();
        active.particles.splice(i, 1);
      }
    }

    // Update cluster visualization
    if (active.cluster) {
      active.cluster.update();
    }

    checkCollisions();
    active.raf = requestAnimationFrame(tick);
  }

  function checkCollisions() {
    const buoys = window.buoyPositions || [];
    if (!buoys.length || !active) return;

    const detectionRadius = 0.04; // ~4km detection range

    for (const b of buoys) {
      if (active.hitSet.has(b.id)) continue;
      
      let particleCount = 0;
      for (const p of active.particles) {
        const dlat = p.lat - b.lat;
        const dlon = p.lon - b.lon;
        const dist = Math.sqrt(dlat * dlat + dlon * dlon);
        
        if (dist <= detectionRadius) particleCount++;
        
        // Trigger alert if concentration is high enough
        if (particleCount > 5) {
          active.hitSet.add(b.id);
          onBuoyHit(b);
          break;
        }
      }
    }
  }

  function onBuoyHit(b) {
    const m = window.buoyMarkers.get(b.id);
    if (m) {
      m.setStyle({ color: '#dc2626', fillColor: '#dc2626' });
      m.bindTooltip(`⚠️ تسرب قريب من ${b.device_id}`, { sticky: true, permanent: true });
    }
    setAlertState();
    toast(`🚨 تم رصد تسرب نفطي قرب العوامة ${b.device_id}`);
  }

  window.resolveLeak = function (buoyId = null) {
    if (!active) return;
    
    if (active.raf) cancelAnimationFrame(active.raf);
    
    // Save leak to database before resolving
    const leakData = {
      lat: active.lat,
      lon: active.lon,
      volume: volumeSel ? volumeSel.value : 'medium',
      status: 'RESOLVED',
      affected_buoys: Array.from(active.hitSet)
    };

    // Call API to save leak record
    fetch('/api/leaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leakData)
    })
    .then(r => r.json())
    .then(data => {
      console.log('Leak saved to database:', data);
    })
    .catch(err => {
      console.error('Failed to save leak:', err);
    });
    
    const fadeOut = () => {
      if (!active || active.particles.length === 0) {
        if (active) {
          if (active.cluster) active.cluster.remove();
          active = null;
          for (const [, m] of window.buoyMarkers.entries()) {
            m.setStyle({ color: '#16a34a', fillColor: '#16a34a' });
            m.unbindTooltip();
          }
          setOkState();
        }
        return;
      }

      // Faster cleanup simulation
      for (let i = 0; i < 15 && active.particles.length > 0; i++) {
        const p = active.particles.pop();
        p.remove();
      }
      
      requestAnimationFrame(fadeOut);
    };

    toast('✅ جاري نشر فرق الاستجابة للطوارئ...', '#16a34a');
    setTimeout(() => {
      toast('✅ تم احتواء التسرب بنجاح', '#16a34a');
      fadeOut();
    }, 1500);
  };
})();