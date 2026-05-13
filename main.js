import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// AETHER ATMOSPHERIC INTELLIGENCE ENGINE
class AetherApp {
    constructor() {
        this.viewer = null;
        this.activeLayers = {
            buoyancy: true,
            ghg: false,
            smoke: false,
            gravity: false,
            mri: false,
            ozone: false,
            pm25: false,
            market: false
        };
        
        this.init();
    }

    async init() {
        this.viewer = new Cesium.Viewer('cesiumContainer', {
            terrainProvider: await Cesium.createWorldTerrainAsync(),
            animation: false, baseLayerPicker: false, fullscreenButton: false,
            vrButton: false, geocoder: false, homeButton: false, infoBox: false,
            sceneModePicker: false, selectionIndicator: false, timeline: false,
            navigationHelpButton: false, scene3DOnly: true,
            baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
                url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                subdomains: 'abcd', minimumLevel: 0, maximumLevel: 20
            }))
        });

        this.viewer._cesiumWidget._creditContainer.style.display = 'none';

        this.nasaLayers = {
            ozone: this.createNasaLayer('OMI_Aura_Total_Column_Ozone'),
            smoke: this.createNasaLayer('OMI_Aura_Aerosol_Index'),
            ghg: this.createNasaLayer('Carbon_Dioxide_Monthly_AIRS_L3')
        };

        this.viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(-95.0, 40.0, 15000000.0)
        });

        this.initBuoyancyEngine();
        this.initEventListeners();
        this.startUIUpdates();
        
        setTimeout(() => {
            const loader = document.getElementById('loading-screen');
            if (loader) loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 1000);
        }, 2000);
    }

    createNasaLayer(layerName) {
        const provider = new Cesium.WebMapTileServiceImageryProvider({
            url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi',
            layer: layerName, style: 'default', format: 'image/png',
            tileMatrixSetID: '2km', maximumLevel: 12
        });
        const layer = new Cesium.ImageryLayer(provider, { show: false, alpha: 0.7 });
        this.viewer.imageryLayers.add(layer);
        return layer;
    }

    initBuoyancyEngine() {
        this.buoyancySystem = new Cesium.ParticleSystem({
            image: '/particle.png',
            startColor: Cesium.Color.CYAN.withAlpha(0.6),
            endColor: Cesium.Color.BLUE.withAlpha(0.0),
            startScale: 1.0, endScale: 5.0, minimumParticleLife: 3.0, maximumParticleLife: 8.0,
            minimumSpeed: 2.0, maximumSpeed: 15.0, imageSize: new Cesium.Cartesian2(30.0, 30.0),
            emissionRate: 80.0, lifetime: 16.0, emitter: new Cesium.CircleEmitter(1500000.0),
            modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(-98.0, 38.0)),
            updateCallback: (p, dt) => {
                const c = Cesium.Cartographic.fromCartesian(p.position);
                if (c) {
                    c.height += (8000.0 * dt) * (1.0 + Math.random() * 0.5); 
                    c.longitude += 0.0001 * dt;
                    p.position = Cesium.Cartographic.toCartesian(c);
                    p.scale = 1.0 + (c.height / 100000.0);
                }
            }
        });
        this.viewer.scene.primitives.add(this.buoyancySystem);
        this.buoyancySystem.show = this.activeLayers.buoyancy;
    }

    initEventListeners() {
        const buttons = {
            'btn-buoyancy': 'buoyancy', 'btn-ghg': 'ghg', 'btn-smoke': 'smoke',
            'btn-gravity': 'gravity', 'btn-mri': 'mri', 'btn-ozone': 'ozone',
            'btn-pm25': 'pm25', 'btn-market': 'market'
        };

        Object.entries(buttons).forEach(([id, layer]) => {
            const btn = document.getElementById(id);
            if (btn) btn.onclick = (e) => this.toggleLayer(layer, e.currentTarget);
        });

        document.getElementById('chat-toggle').onclick = () => {
            document.getElementById('chat-window').classList.toggle('visible');
        };

        document.getElementById('close-dossier').onclick = () => {
            document.getElementById('research-dossier').classList.remove('visible');
        };

        const chatInput = document.querySelector('.chat-input input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && chatInput.value.trim() !== '') {
                    const userMsg = chatInput.value;
                    this.appendMessage('user', userMsg);
                    chatInput.value = '';
                    setTimeout(() => this.processAiQuery(userMsg), 800);
                }
            });
        }

        const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        handler.setInputAction((movement) => {
            const cartesian = this.viewer.camera.pickEllipsoid(movement.position, this.viewer.scene.globe.ellipsoid);
            if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                this.showCountryData(Cesium.Math.toDegrees(cartographic.latitude), Cesium.Math.toDegrees(cartographic.longitude));
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction((movement) => {
            const cartesian = this.viewer.camera.pickEllipsoid(movement.endPosition, this.viewer.scene.globe.ellipsoid);
            if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
                const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
                const alt = (this.viewer.camera.positionCartographic.height / 1000).toFixed(1);
                document.getElementById('coords-display').innerText = `LAT: ${lat} | LON: ${lon} | ALT: ${alt}KM`;
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    appendMessage(role, text) {
        const chatMessages = document.querySelector('.chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${role}`;
        msgDiv.innerText = text;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    processAiQuery(query) {
        const q = query.toLowerCase();
        let response = "Analyzing Aether network telemetry...";
        if (q.includes('methane')) response = "Alert: Methane hotspots detected in Permian Basin (1890 ppb).";
        else if (q.includes('market')) response = "Carbon credit prices are currently $84.20. Market volatility is low.";
        else if (q.includes('help')) response = "I can analyze GHGs, gravity, market trends, and atmospheric buoyancy.";
        this.appendMessage('bot', response);
    }

    toggleLayer(layer, btn) {
        this.activeLayers[layer] = !this.activeLayers[layer];
        btn.classList.toggle('active', this.activeLayers[layer]);
        
        if (this.nasaLayers[layer]) this.nasaLayers[layer].show = this.activeLayers[layer];
        if (layer === 'buoyancy') this.buoyancySystem.show = this.activeLayers[layer];
        if (layer === 'smoke') this.visualizeSmoke(this.activeLayers[layer]);
        if (layer === 'mri') this.visualizeMRI(this.activeLayers[layer]);
        if (layer === 'pm25') this.fetchOpenAQData(this.activeLayers[layer]);
        if (layer === 'ghg') this.visualizeGHG(this.activeLayers[layer]);
        if (layer === 'gravity') this.visualizeGravity(this.activeLayers[layer]);
        
        if (layer === 'market') {
            const panel = document.getElementById('market-panel');
            if (this.activeLayers[layer]) {
                panel.classList.add('visible');
            } else {
                panel.classList.remove('visible');
            }
            this.visualizeCarbonProjects(this.activeLayers[layer]);
        }
    }

    showCountryData(lat, lon) {
        let region = "Global Waters";
        if (lat > 25 && lat < 49 && lon > -125 && lon < -67) region = "United States";
        else if (lat > 35 && lat < 70 && lon > -10 && lon < 40) region = "Europe";
        else if (lat > 10 && lat < 50 && lon > 70 && lon < 140) region = "Asia-Pacific";
        else if (lat > -35 && lat < 35 && lon > -20 && lon < 50) region = "Africa";

        const val = (Math.random() * 100).toFixed(1);
        const infoPanel = document.getElementById('country-info');
        infoPanel.innerHTML = `
            <div class="info-header">REGION: ${region}</div>
            <div class="info-body">
                <p>AQI Index: ${val}</p>
                <p>Status: ${val > 50 ? 'CRITICAL' : 'OPTIMAL'}</p>
                <button class="research-btn" onclick="window.aetherApp.openDossier('${region}')">OPEN RESEARCH DOSSIER</button>
            </div>
        `;
        infoPanel.classList.add('visible');
        setTimeout(() => infoPanel.classList.remove('visible'), 8000);
    }

    openDossier(region) {
        document.getElementById('dossier-region').innerText = region;
        
        // Mock research data population
        document.getElementById('dossier-market-data').innerHTML = `
            <p>Carbon Market Maturity: HIGH</p>
            <p>Regulatory Framework: Article 6 Compliant</p>
            <p>Current Credit Issuance: 45.2M MTCO2e</p>
            <p>Project Pipeline: 124 Reforestation / 42 Solar</p>
        `;
        document.getElementById('dossier-env-data').innerHTML = `
            <p>Average Methane Level: 1840 ppb</p>
            <p>CO2 Concentration: 418.2 ppm</p>
            <p>Aerosol Index: 0.85 (Low)</p>
            <p>Gravity Anomaly Delta: -2.4cm SWE</p>
        `;
        document.getElementById('dossier-recs').innerHTML = `
            <p>1. Accelerate green bond issuance for mangrove restoration in coastal zones.</p>
            <p>2. Implement AI-driven methane leak detection for aging pipeline infrastructure.</p>
            <p>3. Expand the regional carbon tax to include secondary industrial sectors by Q4.</p>
        `;

        document.getElementById('research-dossier').classList.add('visible');
    }

    async fetchOpenAQData(active) {
        if (!active) {
            this.viewer.entities.values.forEach(e => { if (e.id?.startsWith('aq_')) this.viewer.entities.remove(e); });
            return;
        }
        try {
            const res = await fetch('https://api.openaq.org/v2/latest?limit=50&parameter=pm25');
            const data = await res.json();
            data.results.forEach((r, i) => {
                if (r.coordinates) {
                    this.viewer.entities.add({
                        id: `aq_${i}`,
                        position: Cesium.Cartesian3.fromDegrees(r.coordinates.longitude, r.coordinates.latitude),
                        point: { pixelSize: 10, color: Cesium.Color.GOLD.withAlpha(0.8), outlineColor: Cesium.Color.WHITE, outlineWidth: 1 }
                    });
                }
            });
        } catch (e) { console.error(e); }
    }

    visualizeGHG(active) {
        if (active) {
            this.viewer.entities.add({
                id: 'ghg_hotspot',
                position: Cesium.Cartesian3.fromDegrees(-102.3, 31.9, 10000),
                ellipse: { semiMinorAxis: 200000, semiMajorAxis: 200000, material: Cesium.Color.ORANGE.withAlpha(0.4), height: 50000 }
            });
        } else { this.viewer.entities.removeById('ghg_hotspot'); }
    }

    visualizeCarbonProjects(active) {
        if (active) {
            const projects = [{ lat: -3.46, lon: -62.2, name: 'Amazon Conservation' }, { lat: 24.0, lon: 15.0, name: 'Sahara Solar' }];
            projects.forEach((p, i) => {
                this.viewer.entities.add({
                    id: `project_${i}`, position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
                    billboard: { image: 'https://img.icons8.com/nolan/64/tree.png', width: 40, height: 40 },
                    label: { text: p.name, font: '12px Orbitron', fillColor: Cesium.Color.LIME, pixelOffset: new Cesium.Cartesian2(0, -40) }
                });
            });
        } else { this.viewer.entities.values.forEach(e => { if (e.id?.startsWith('project_')) this.viewer.entities.remove(e); }); }
    }

    visualizeSmoke(active) {
        if (active) {
            this.smokeSystem = new Cesium.ParticleSystem({
                image: '/particle.png',
                startColor: Cesium.Color.DARKGREY.withAlpha(0.6),
                endColor: Cesium.Color.TRANSPARENT,
                startScale: 2.0, endScale: 12.0, emissionRate: 60.0, lifetime: 15.0,
                emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(800000, 800000, 20000)),
                modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(-115.0, 45.0)),
                updateCallback: (p, dt) => {
                    const c = Cesium.Cartographic.fromCartesian(p.position);
                    if (c) { c.longitude += 0.003 * dt; c.height += 500.0 * dt; p.position = Cesium.Cartographic.toCartesian(c); }
                }
            });
            this.viewer.scene.primitives.add(this.smokeSystem);
        } else if (this.smokeSystem) { this.viewer.scene.primitives.remove(this.smokeSystem); this.smokeSystem = null; }
    }

    visualizeMRI(active) {
        if (active) {
            this.mriSlice = this.viewer.entities.add({
                wall: {
                    positions: Cesium.Cartesian3.fromDegreesArrayHeights([-70.0, -10.0, 0, -50.0, -10.0, 0, -50.0, 10.0, 0, -70.0, 10.0, 0, -70.0, -10.0, 0]),
                    maximumHeights: [150000, 150000, 150000, 150000, 150000],
                    material: Cesium.Color.CYAN.withAlpha(0.4), outline: true, outlineColor: Cesium.Color.CYAN
                }
            });
        } else if (this.mriSlice) { this.viewer.entities.remove(this.mriSlice); this.mriSlice = null; }
    }

    visualizeGravity(active) {
        if (active) {
            this.gravityGrid = this.viewer.entities.add({
                rectangle: {
                    coordinates: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
                    material: new Cesium.GridMaterialProperty({ color: Cesium.Color.VIOLET.withAlpha(0.8), cellAlpha: 0.1, lineCount: new Cesium.Cartesian2(40, 40), thickness: 2.0 }),
                    height: 200000.0
                }
            });
        } else if (this.gravityGrid) { this.viewer.entities.remove(this.gravityGrid); this.gravityGrid = null; }
    }

    startUIUpdates() {
        setInterval(() => {
            const ch4 = (1880 + Math.random() * 20).toFixed(1);
            document.querySelectorAll('.data-item .value')[0].innerHTML = `${ch4} PPB ▲`;
        }, 3000);
    }
}

window.addEventListener('load', () => { window.aetherApp = new AetherApp(); });
