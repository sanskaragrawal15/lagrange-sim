
(function () {
    "use strict";

    // ── Device Detection ───────────────────────────────────────────────
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const isLowEnd = isMobile || window.innerWidth < 480;

    // ── constants ──────────────────────────────────────────────
    const DEG = Math.PI / 180;
    const TWO_PI = Math.PI * 2;
    const MOON_ORBIT_R = 120;
    const MOON_PERIOD_DAYS = 27.3;
    const EARTH_RADIUS = 12;
    const MOON_RADIUS = 3.5;
    const INCL = 5.1 * DEG;

    // L-point ratios along EM line
    const L1_RATIO = 0.848;
    const L2_RATIO = 1.154;

    // Colors
    const COL = {
        L1: 0xFF6B6B,
        L2: 0xFF9F43,
        L3: 0xA29BFE,
        L4: 0xFFD966,
        L5: 0x55EFC4,
        earth: 0x4fc3f7,
        moon: 0xaaaaaa,
        cargo: 0x55EFC4,
        field: 0xff79c6,
    };

    // ── state ──────────────────────────────────────────────────
    let playing = true;
    let speed = 1;
    let simTime = 0;
    let moonAngle = 0;
    let showTriangle = true;
    let showLPoints = true;
    let showOrbits = true;
    let showCargo = false;
    let showField = false;
    let tooltipTimeout = null;
    let globalIsMobile = isMobile;
    let globalIsLowEnd = isLowEnd;

    // Camera
    let camR = 320, camTheta = Math.PI * 0.25, camPhi = Math.PI * 0.35;
    let targetCamR = camR, targetCamTheta = camTheta, targetCamPhi = camPhi;
    let isDragging = false, prevMouse = { x: 0, y: 0 };
    let cinematicMode = false;
    let cinematicTime = 0;

    // FPS tracking
    let frameCount = 0, fpsAccum = 0, lastFpsUpdate = 0, displayFps = 60;
    
    // ── renderer ───────────────────────────────────────────────
    const canvas = document.getElementById("mainCanvas");
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !isLowEnd,
        alpha: true,
        powerPreference: isLowEnd ? "low-power" : "high-performance",
    });
    renderer.setPixelRatio(isLowEnd ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isLowEnd;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000005, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // ── scene & camera ─────────────────────────────────────────
    const scene = new THREE.Scene();
    // Add fog for depth
    scene.fog = new THREE.FogExp2(0x000005, 0.0004);

    const camera = new THREE.PerspectiveCamera(
        55,
        window.innerWidth / window.innerHeight,
        0.1,
        5000
    );
    camera.position.set(0, 120, 280);

    // ── raycaster ──────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const clickables = [];

    // ============================================================
    //  1. ENHANCED STAR FIELD WITH NEBULA
    // ============================================================
    function createStars() {
        // Layer 1 – faint background (reduced on mobile)
        const count1 = isLowEnd ? 1500 : 4000;
        const pos1 = new Float32Array(count1 * 3);
        const colors1 = new Float32Array(count1 * 3);
        for (let i = 0; i < count1; i++) {
            pos1[i * 3] = (Math.random() - 0.5) * 3500;
            pos1[i * 3 + 1] = (Math.random() - 0.5) * 3500;
            pos1[i * 3 + 2] = (Math.random() - 0.5) * 3500;
            const temp = Math.random();
            if (temp < 0.1) {
                colors1[i * 3] = 1.0; colors1[i * 3 + 1] = 0.8; colors1[i * 3 + 2] = 0.6;
            } else if (temp < 0.2) {
                colors1[i * 3] = 0.7; colors1[i * 3 + 1] = 0.8; colors1[i * 3 + 2] = 1.0;
            } else {
                colors1[i * 3] = 1.0; colors1[i * 3 + 1] = 1.0; colors1[i * 3 + 2] = 1.0;
            }
        }
        const geom1 = new THREE.BufferGeometry();
        geom1.setAttribute("position", new THREE.BufferAttribute(pos1, 3));
        geom1.setAttribute("color", new THREE.BufferAttribute(colors1, 3));
        const mat1 = new THREE.PointsMaterial({
            size: isLowEnd ? 1.2 : 0.8,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        scene.add(new THREE.Points(geom1, mat1));

        // Layer 2 – bright stars (reduced on mobile)
        const count2 = isLowEnd ? 200 : 600;
        const pos2 = new Float32Array(count2 * 3);
        for (let i = 0; i < count2; i++) {
            pos2[i * 3] = (Math.random() - 0.5) * 3500;
            pos2[i * 3 + 1] = (Math.random() - 0.5) * 3500;
            pos2[i * 3 + 2] = (Math.random() - 0.5) * 3500;
        }
        const geom2 = new THREE.BufferGeometry();
        geom2.setAttribute("position", new THREE.BufferAttribute(pos2, 3));
        const mat2 = new THREE.PointsMaterial({
            size: isLowEnd ? 2.0 : 1.5,
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        scene.add(new THREE.Points(geom2, mat2));

        // Nebula clouds
        createNebula();
    }

    function createNebula() {
        if (isLowEnd) return;
        const nebulaColors = [
            { color: 0x4411aa, opacity: 0.012, size: 600, pos: [-800, 200, -1000] },
            { color: 0x1144aa, opacity: 0.008, size: 500, pos: [600, -300, -900] },
        ];

        for (const n of nebulaColors) {
            const geo = new THREE.SphereGeometry(n.size, 16, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: n.color,
                transparent: true,
                opacity: n.opacity,
                side: THREE.BackSide,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(...n.pos);
            scene.add(mesh);
        }
    }

    // ============================================================
    //  2. ENHANCED LIGHTING
    // ============================================================
    let earthAlbedoLight, bellevGlow;
    let sunGroup, otherPlanets = [];
    const sunPos = new THREE.Vector3(-3500, 200, 1000);

    function createLights() {
        // Sun directional
        const sun = new THREE.DirectionalLight(0xfff5e0, 2.6);
        sun.position.copy(sunPos);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.bias = -0.0001;
        scene.add(sun);

        // Secondary sun fill
        const sunFill = new THREE.DirectionalLight(0xffe0b0, 0.4);
        sunFill.position.set(-1000, -50, 300);
        scene.add(sunFill);

        // Deep-space ambient
        const ambient = new THREE.AmbientLight(0x0a0a2e, 0.45);
        scene.add(ambient);

        // Hemisphere light for subtle top/bottom differentiation
        const hemi = new THREE.HemisphereLight(0x1122aa, 0x0a0505, 0.15);
        scene.add(hemi);

        // Earth albedo
        earthAlbedoLight = new THREE.PointLight(0x2244ff, 0.35, 90);
        earthAlbedoLight.position.set(0, 0, 0);
        scene.add(earthAlbedoLight);

        // Bellevistat glow
        bellevGlow = new THREE.PointLight(0xFFD966, 0.9, 50);
        scene.add(bellevGlow);
    }

    // ── Procedural Planet Generator ───────────────────────────
    function makePlanetBump(w, h) {
        const REAL_W = w || 512, REAL_H = h || 256;
        const c = document.createElement('canvas');
        c.width = REAL_W; c.height = REAL_H;
        const ctx = c.getContext('2d');
        const proxyW = 256, proxyH = 128;
        const tempC = document.createElement('canvas');
        tempC.width = proxyW; tempC.height = proxyH;
        const tempCtx = tempC.getContext('2d');
        const imgData = tempCtx.createImageData(proxyW, proxyH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255;
            data[i] = data[i+1] = data[i+2] = v;
            data[i+3] = 255;
        }
        tempCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(tempC, 0, 0, REAL_W, REAL_H);
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return tex;
    }

    function makePlanetTexture(type, w, h) {
        const REAL_W = w || 1024, REAL_H = h || 512;
        const c = document.createElement('canvas');
        c.width = REAL_W; c.height = REAL_H;
        const ctx = c.getContext('2d');
        const proxyW = 256, proxyH = 128;
        const tempC = document.createElement('canvas');
        tempC.width = proxyW; tempC.height = proxyH;
        const tempCtx = tempC.getContext('2d');
        const imgData = tempCtx.createImageData(proxyW, proxyH);
        const data = imgData.data;

        function noise(x, y, freq, oct) {
            let v = 0, amp = 1;
            for(let i=0; i<oct; i++) {
                v += (Math.sin(x*freq) * Math.cos(y*freq)) * amp;
                freq *= 2.1; amp *= 0.5;
            }
            return (v + 1) / 2;
        }

        for (let i = 0; i < data.length; i += 4) {
            const idx = i/4, x = idx % proxyW, y = Math.floor(idx/proxyW);
            const nx = x/proxyW * Math.PI*2, ny = y/proxyH * Math.PI;
            let r=0,g=0,b=0;
            if (type==='jupiter') {
                const n = noise(nx*2, ny*12, 1.0, 3);
                r=200+n*55; g=160+n*40; b=120+n*30;
            } else if (type==='mars') {
                const n = noise(nx*4, ny*4, 2.0, 4);
                r=180+n*40; g=80+n*30; b=40+n*20;
            } else if (type==='venus') {
                const n = noise(nx*2, ny*2, 1.0, 2);
                r=220+n*35; g=180+n*30; b=110+n*20;
            } else {
                const n = noise(nx*8, ny*8, 4.0, 4);
                r=100+n*50; g=100+n*50; b=100+n*50;
            }
            data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
        }
        tempCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(tempC, 0, 0, REAL_W, REAL_H);
        return new THREE.CanvasTexture(c);
    }

    function createSolarSystem() {
        sunGroup = new THREE.Group();
        sunGroup.position.copy(sunPos);

        const sunGeo = new THREE.SphereGeometry(200, 64, 64);
        const sunVS = `
            varying vec2 vUv;
            varying vec3 vPosition;
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        const sunFS = `
            uniform float time;
            varying vec3 vPosition;
            // Simplex noise 3D (shortened)
            vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
            vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
            float snoise(vec3 v){
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                vec4 p = permute( permute( permute( 
                            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                          + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                          + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                vec4 j = p - 49.0 * floor(p * 0.02040816326);
                vec4 x_ = floor(j * 0.14285714285);
                vec4 y_ = floor(j - 7.0 * x_ );
                vec4 x = x_ * 0.14285714285 + 0.07142857142;
                vec4 y = y_ * 0.14285714285 + 0.07142857142;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m; return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }
            void main() {
                float n = snoise(vPosition * 0.02 + time * 0.08) * 0.5 + 0.5;
                vec3 colDark = vec3(0.4, 0.0, 0.0);
                vec3 colMid = vec3(1.0, 0.3, 0.0);
                vec3 colBright = vec3(1.0, 0.9, 0.1);
                vec3 fCol = mix(colDark, colMid, smoothstep(0.0, 0.5, n));
                fCol = mix(fCol, colBright, smoothstep(0.5, 1.0, n));
                gl_FragColor = vec4(fCol * 1.6, 1.0);
            }
        `;
        const sunMat = new THREE.ShaderMaterial({
            vertexShader: sunVS,
            fragmentShader: sunFS,
            uniforms: { time: { value: 0 } }
        });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.userData = { 
            name: "☀️ The Sun", 
            info: "Type: G2V Star\nSurface Temp: 5,778 K\nMass: 1.98×10³⁰ kg" 
        };
        sunGroup.userData.shaderMat = sunMat;
        sunGroup.add(sunMesh);
        clickables.push(sunMesh);

        // Core glow sprite
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 512; glowCanvas.height = 512;
        const ctx = glowCanvas.getContext('2d');
        const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        grad.addColorStop(0, 'rgba(255, 220, 100, 1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.fillRect(0,0,512,512);

        const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(glowCanvas),
            blending: THREE.AdditiveBlending,
            transparent: true, depthWrite: false
        }));
        sunGlow.scale.set(1600, 1600, 1);
        sunGroup.add(sunGlow);
        scene.add(sunGroup);

        const planetsData = [
            { name: "Mercury", color: 0x888888, size: 4, dist: 600, speed: 0.1, info: "Distance: 0.39 AU\nNo Atmosphere" },
            { name: "Venus", color: 0xe6cdab, size: 8, dist: 1200, speed: 0.05, info: "Distance: 0.72 AU\nAtmosphere: Dense CO2" },
            { name: "Mars", color: 0xc1440e, size: 6, dist: 2200, speed: 0.03, info: "Distance: 1.52 AU\nAtmosphere: Thin CO2" },
            { name: "Jupiter", color: 0xd39c7e, size: 28, dist: 3800, speed: 0.015, info: "Distance: 5.20 AU\nGas Giant" },
            { name: "Saturn", color: 0xe3e0c0, size: 24, dist: 5000, speed: 0.01, info: "Distance: 9.58 AU\nRinged Gas Giant" },
            { name: "Uranus", color: 0xadd8e6, size: 14, dist: 6200, speed: 0.007, info: "Distance: 19.2 AU\nIce Giant" },
            { name: "Neptune", color: 0x00008b, size: 14, dist: 7400, speed: 0.005, info: "Distance: 30.1 AU\nIce Giant" },
            { name: "Pluto", color: 0xdddddd, size: 3, dist: 8500, speed: 0.003, info: "Distance: 39.5 AU\nDwarf Planet" },
        ];

        for (const pd of planetsData) {
            // Planet Mesh
            const pGeo = new THREE.SphereGeometry(pd.size, 32, 32);
            const tex = makePlanetTexture(pd.name.toLowerCase(), 1024, 512);
            const pMat = new THREE.MeshPhongMaterial({
                map: tex,
                bumpMap: makePlanetBump(512, 256),
                bumpScale: 0.5,
                shininess: 5,
            });
            const pMesh = new THREE.Mesh(pGeo, pMat);

            // Orbital Ring
            const orbitPoints = [];
            const segments = 128;
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                orbitPoints.push(new THREE.Vector3(
                    sunPos.x + Math.cos(theta) * pd.dist,
                    sunPos.y,
                    sunPos.z + Math.sin(theta) * pd.dist
                ));
            }
            const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
            const orbitMat = new THREE.LineBasicMaterial({
                color: pd.color,
                transparent: true,
                opacity: 0.15
            });
            const orbitLine = new THREE.Line(orbitGeo, orbitMat);
            scene.add(orbitLine);

            // Calculate initial position around sun
            const angle = Math.random() * Math.PI * 2;

            pMesh.userData = {
                name: pd.name === "Pluto" ? "🪨 Pluto" : "🪐 " + pd.name,
                info: pd.info,
                orbitDist: pd.dist,
                angle: angle,
                speed: pd.speed
            };

            // Label
            const label = makeTextSprite(pd.name + "   ", { fontsize: 22, color: "#ffffff" });
            label.scale.set(0.08, 0.04, 1);
            pMesh.add(label);
            label.position.y += pd.size + 15;

            // Simple ring for Saturn
            if (pd.name === "Saturn") {
                const ringGeo = new THREE.RingGeometry(pd.size * 1.4, pd.size * 2.2, 32);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xaa9977, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = Math.PI / 2.5;
                pMesh.add(ring);
            }

            // Faint vertical ring for Uranus
            if (pd.name === "Uranus") {
                const ringGeo = new THREE.RingGeometry(pd.size * 1.5, pd.size * 1.8, 32);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xcceedd, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.y = Math.PI / 2;
                pMesh.add(ring);
            }

            clickables.push(pMesh);
            scene.add(pMesh);
            otherPlanets.push(pMesh);
        }
    }

    // ============================================================
    //  3. ENHANCED EARTH
    // ============================================================
    let earthGroup, earthMesh, cloudMesh;

    function createEarth() {
        earthGroup = new THREE.Group();

        // Main sphere
        const geo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
        const loader = new THREE.TextureLoader();

        const earthMat = new THREE.MeshPhongMaterial({
            color: 0x2288cc,
            specular: 0x4499ff,
            shininess: 45,
            emissive: 0x061020,
            emissiveIntensity: 0.2,
        });
        earthMesh = new THREE.Mesh(geo, earthMat);
        earthMesh.castShadow = true;
        earthMesh.receiveShadow = true;
        earthMesh.userData = {
            name: "🌍 Earth",
            info: "Distance from Sun: 149.6M km\nRadius: 6,371 km\nMass: 5.97×10²⁴ kg\nGravity: 9.81 m/s²\nAtmosphere: N₂/O₂",
        };
        clickables.push(earthMesh);

        loader.load(
            "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
            function (tex) {
                earthMesh.material.map = tex;
                earthMesh.material.needsUpdate = true;
            },
            undefined,
            function () { /* fallback color already set */ }
        );

        earthGroup.add(earthMesh);

        // Cloud layer
        const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.03, 48, 48);
        const cloudMat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
        });
        cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        earthGroup.add(cloudMesh);

        // Inner atmosphere glow
        const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.12, 48, 48);
        const atmoMat = new THREE.MeshBasicMaterial({
            color: 0x4499ff,
            transparent: true,
            opacity: 0.06,
            side: THREE.BackSide,
            depthWrite: false,
        });
        earthGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

        // Outer atmosphere halo
        const haloGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.25, 32, 32);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0x3388ff,
            transparent: true,
            opacity: 0.03,
            side: THREE.BackSide,
            depthWrite: false,
        });
        earthGroup.add(new THREE.Mesh(haloGeo, haloMat));

        // Subtle grid overlay
        const wireGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.005, 24, 12);
        const edges = new THREE.EdgesGeometry(wireGeo);
        const wireframe = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08 })
        );
        earthGroup.add(wireframe);

        // Axial tilt
        earthGroup.rotation.z = 23.5 * DEG;
        scene.add(earthGroup);
    }

    // ============================================================
    //  4. ENHANCED MOON
    // ============================================================
    let moonMesh, moonGlow;

    function createMoon() {
        const geo = new THREE.SphereGeometry(MOON_RADIUS, 48, 48);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xbbbbbb,
            specular: 0x444444,
            shininess: 8,
            emissive: 0x050505,
            emissiveIntensity: 0.1,
        });
        moonMesh = new THREE.Mesh(geo, mat);
        moonMesh.castShadow = true;
        moonMesh.userData = {
            name: "🌙 Moon (Luna)",
            info: "Distance: 384,400 km from Earth\nRadius: 1,737 km\nOrbital Period: 27.3 days\nTidally locked to Earth\n\n📦 Source of lunar ores\nfor Bellevistat manufacturing",
        };
        clickables.push(moonMesh);

        const loader = new THREE.TextureLoader();
        loader.load(
            "https://threejs.org/examples/textures/planets/moon_1024.jpg",
            function (tex) {
                moonMesh.material.map = tex;
                moonMesh.material.needsUpdate = true;
            },
            undefined,
            function () { }
        );

        scene.add(moonMesh);

        // Moon shadow glow
        const glowGeo = new THREE.SphereGeometry(MOON_RADIUS * 1.3, 24, 24);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x888899,
            transparent: true,
            opacity: 0.04,
            side: THREE.BackSide,
            depthWrite: false,
        });
        moonGlow = new THREE.Mesh(glowGeo, glowMat);
        scene.add(moonGlow);
    }

    function moonPos(angle) {
        return new THREE.Vector3(
            MOON_ORBIT_R * Math.cos(angle),
            MOON_ORBIT_R * Math.sin(INCL) * Math.sin(angle),
            MOON_ORBIT_R * Math.sin(angle)
        );
    }

    // ============================================================
    //  5. LAGRANGE POINTS
    // ============================================================
    let lPoints = {};
    let lGlowSprites = {};
    let lLabels = {};

    function makeGlowTexture(color) {
        const size = 128;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
        grad.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
        grad.addColorStop(0.3, `rgba(${r},${g},${b},0.3)`);
        grad.addColorStop(0.7, `rgba(${r},${g},${b},0.05)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(c);
        return tex;
    }

    function createLPoint(name, color, radius, stable) {
        const geo = new THREE.SphereGeometry(radius, 24, 24);
        const mat = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.6,
            transparent: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { name, stable, color };
        clickables.push(mesh);
        scene.add(mesh);
        lPoints[name] = mesh;

        // Glow sprite
        const spriteMat = new THREE.SpriteMaterial({
            map: makeGlowTexture(color),
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(stable ? 22 : 12, stable ? 22 : 12, 1);
        scene.add(sprite);
        lGlowSprites[name] = sprite;

        // Label
        const label = makeTextSprite(name, { fontsize: 20, color: `#${color.toString(16).padStart(6, '0')}` });
        label.material.sizeAttenuation = false;
        label.scale.set(0.028, 0.014, 1);
        scene.add(label);
        lLabels[name] = label;
    }

    function createAllLPoints() {
        createLPoint("L1", COL.L1, 2.0, false);
        createLPoint("L2", COL.L2, 2.0, false);
        createLPoint("L3", COL.L3, 2.0, false);
        createLPoint("L4", COL.L4, 3.5, true);
        createLPoint("L5", COL.L5, 2.5, true);
    }

    function setLPointInfos() {
        lPoints["L1"].userData.info = "⚠️ Unstable equilibrium point\n84.8% of EM distance\n~326,000 km from Earth\nRequires active station-keeping\n\nUsed for: solar observatories,\ntransfer staging";
        lPoints["L2"].userData.info = "⚠️ Unstable equilibrium point\n115.4% of EM distance\n~444,000 km from Earth\nRequires active station-keeping\n\nUsed for: deep-space telescopes";
        lPoints["L3"].userData.info = "⚠️ Unstable equilibrium point\nOpposite Moon, same orbit\n~384,400 km from Earth\nRequires active station-keeping\n\nUsed for: relay communications";
        lPoints["L4"].userData.info = "★ Stable Lagrange Point\nLeading Moon by 60°\n384,400 km from Earth\nNatural gravitational \"valley\"\n\n🏗️ BELLEVISTAT STATION\nPopulation: 12,000 (IOC)\nTransient: up to 900\nPurpose: Heavy industrial hub\nGravity: 0.45–0.9g selectable\nPeriod: 27.3 days\n\n🔧 Click station for details";
        lPoints["L5"].userData.info = "★ Stable Lagrange Point\nTrailing Moon by 60°\n384,400 km from Earth\nNatural gravitational \"valley\"\n\nPotential future expansion site\n(Foundation Society reserve)";
    }

    function lPointPositions(angle) {
        const mPos = moonPos(angle);
        const dir = mPos.clone().normalize();

        const l1 = dir.clone().multiplyScalar(MOON_ORBIT_R * L1_RATIO);
        l1.y = mPos.y * L1_RATIO;

        const l2 = dir.clone().multiplyScalar(MOON_ORBIT_R * L2_RATIO);
        l2.y = mPos.y * L2_RATIO;

        const l3 = dir.clone().multiplyScalar(-MOON_ORBIT_R);
        l3.y = -mPos.y;

        const a4 = angle + Math.PI / 3;
        const l4 = new THREE.Vector3(
            MOON_ORBIT_R * Math.cos(a4),
            MOON_ORBIT_R * Math.sin(INCL) * Math.sin(a4),
            MOON_ORBIT_R * Math.sin(a4)
        );

        const a5 = angle - Math.PI / 3;
        const l5 = new THREE.Vector3(
            MOON_ORBIT_R * Math.cos(a5),
            MOON_ORBIT_R * Math.sin(INCL) * Math.sin(a5),
            MOON_ORBIT_R * Math.sin(a5)
        );

        return { L1: l1, L2: l2, L3: l3, L4: l4, L5: l5 };
    }

    // ============================================================
    //  6. DETAILED BELLEVISTAT STATION
    // ============================================================
    let stationGroup, stationLabel;

    function createBellevistat() {
        stationGroup = new THREE.Group();

        const goldMat = new THREE.MeshPhongMaterial({
            color: 0xFFD966,
            emissive: 0xFFD966,
            emissiveIntensity: 0.45,
            shininess: 80,
            specular: 0xffee88,
        });

        const silverMat = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            emissive: 0x222222,
            emissiveIntensity: 0.1,
            shininess: 60,
        });

        const panelMat = new THREE.MeshPhongMaterial({
            color: 0x2255bb,
            emissive: 0x112255,
            emissiveIntensity: 0.25,
            shininess: 90,
            specular: 0x4488ff,
        });

        const redMat = new THREE.MeshPhongMaterial({
            color: 0xff4444,
            emissive: 0xff2222,
            emissiveIntensity: 0.3,
        });

        // Main habitat torus (rotating for artificial gravity)
        const mainTorus = new THREE.Mesh(
            new THREE.TorusGeometry(5.5, 0.7, 16, 48),
            goldMat
        );
        stationGroup.add(mainTorus);

        // Secondary habitat torus (perpendicular, different g-level)
        const secTorus = new THREE.Mesh(
            new THREE.TorusGeometry(4, 0.5, 12, 36),
            goldMat.clone()
        );
        secTorus.rotation.x = Math.PI / 2;
        stationGroup.add(secTorus);

        // Industrial torus (larger, for manufacturing)
        const indTorus = new THREE.Mesh(
            new THREE.TorusGeometry(7, 0.4, 12, 48),
            silverMat
        );
        indTorus.rotation.x = Math.PI / 4;
        stationGroup.add(indTorus);

        // Central hub (zero-g industrial core)
        const hub = new THREE.Mesh(
            new THREE.SphereGeometry(2, 24, 24),
            new THREE.MeshPhongMaterial({
                color: 0xdddddd,
                emissive: 0x444444,
                emissiveIntensity: 0.2,
                shininess: 60,
            })
        );
        stationGroup.add(hub);

        // Hub connecting cylinder
        const hubCyl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.6, 4, 12),
            silverMat
        );
        stationGroup.add(hubCyl);

        // Spokes connecting habitat to hub (6 spokes)
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TWO_PI;
            const spoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6),
                silverMat
            );
            spoke.position.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
            spoke.rotation.z = -a + Math.PI / 2;
            spoke.rotation.x = Math.PI / 2;
            stationGroup.add(spoke);
        }

        // Solar panel arrays (4 large panels)
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TWO_PI;
            const panelGroup = new THREE.Group();

            // Panel arm
            const arm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 5, 6),
                silverMat
            );
            arm.rotation.z = Math.PI / 2;
            panelGroup.add(arm);

            // Panel surface
            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.05, 2),
                panelMat
            );
            panel.position.x = 2;
            panelGroup.add(panel);

            panelGroup.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
            panelGroup.rotation.y = -a;
            stationGroup.add(panelGroup);
        }

        // Radiator fins (4, slight red tint)
        for (let i = 0; i < 4; i++) {
            const a = ((i + 0.5) / 4) * TWO_PI;
            const fin = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 3, 1.5),
                redMat
            );
            fin.position.set(Math.cos(a) * 8, 0, Math.sin(a) * 8);
            fin.rotation.y = -a;
            stationGroup.add(fin);
        }

        // Docking ports (4 small cylinders)
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TWO_PI;
            const dock = new THREE.Mesh(
                new THREE.CylinderGeometry(0.25, 0.35, 1.5, 8),
                silverMat
            );
            dock.position.set(0, 2.5 + i * 0.3, 0);
            dock.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), a * 0.3);
            stationGroup.add(dock);
        }

        // Beacon lights (blinking)
        const beaconMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
        });
        for (let i = 0; i < 3; i++) {
            const beacon = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 8, 8),
                beaconMat.clone()
            );
            const ba = (i / 3) * TWO_PI;
            beacon.position.set(Math.cos(ba) * 5.5, 0.8, Math.sin(ba) * 5.5);
            beacon.userData.isBeacon = true;
            stationGroup.add(beacon);
        }

        // Large invisible click sphere covering the entire station
        const clickZone = new THREE.Mesh(
            new THREE.SphereGeometry(10, 16, 16),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        clickZone.userData = {
            name: "🏗️ Bellevistat Station",
            info: "Earth-Moon L4 Industrial Settlement\nPopulation: 12,000 (IOC)\nClick for detailed information...",
            isStation: true,
        };
        stationGroup.add(clickZone);
        clickables.push(clickZone);

        scene.add(stationGroup);

        // Label sprite
        stationLabel = makeTextSprite("Bellevistat (L4) ★", {
            fontsize: 28,
            color: "#FFD966",
        });
        stationLabel.material.sizeAttenuation = false;
        stationLabel.scale.set(0.06, 0.03, 1);
        scene.add(stationLabel);
    }

    // ============================================================
    //  7. ORBIT TRAIL PARTICLES (near L4)
    // ============================================================
    let orbitParticles;

    function createOrbitParticles() {
        const count = isLowEnd ? 80 : 200;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // Cloud around L4 position
            const angle = Math.random() * TWO_PI;
            const radius = 3 + Math.random() * 12;
            const height = (Math.random() - 0.5) * 8;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = height;
            positions[i * 3 + 2] = Math.sin(angle) * radius;

            // Gold-ish with variation
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
            colors[i * 3 + 2] = 0.3 + Math.random() * 0.3;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        orbitParticles = new THREE.Points(geo, mat);
        scene.add(orbitParticles);
    }

    // ============================================================
    //  8. TEXT SPRITES
    // ============================================================
    function makeTextSprite(text, params) {
        const fontsize = params.fontsize || 24;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = 512;
        canvas.height = 128;

        ctx.font = `${fontsize}px 'Outfit', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const measured = ctx.measureText(text);
        const tw = measured.width + 30;
        const th = fontsize + 16;
        const cx = canvas.width / 2, cy = canvas.height / 2;

        // Background pill with gradient
        const bgGrad = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
        bgGrad.addColorStop(0, "rgba(0,0,0,0.6)");
        bgGrad.addColorStop(0.5, "rgba(0,0,0,0.5)");
        bgGrad.addColorStop(1, "rgba(0,0,0,0.6)");
        ctx.fillStyle = bgGrad;
        roundRect(ctx, cx - tw / 2, cy - th / 2, tw, th, 12);
        ctx.fill();

        // Subtle border
        ctx.strokeStyle = (params.color || "#ffffff") + "33";
        ctx.lineWidth = 1;
        roundRect(ctx, cx - tw / 2, cy - th / 2, tw, th, 12);
        ctx.stroke();

        ctx.fillStyle = params.color || "#ffffff";
        ctx.fillText(text, cx, cy);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: false,
        });
        return new THREE.Sprite(mat);
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // ============================================================
    //  9. EQUILATERAL TRIANGLE
    // ============================================================
    let triangleLine, arcLine, triangleLabels = [], arcLabel;

    function createTriangle() {
        const tGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(4 * 3);
        tGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const tMat = new THREE.LineDashedMaterial({
            color: 0xFFD966,
            dashSize: 3,
            gapSize: 2,
            transparent: true,
            opacity: 0.6,
        });
        triangleLine = new THREE.Line(tGeo, tMat);
        triangleLine.computeLineDistances();
        scene.add(triangleLine);

        const arcGeo = new THREE.BufferGeometry();
        const arcPos = new Float32Array(41 * 3);
        arcGeo.setAttribute("position", new THREE.BufferAttribute(arcPos, 3));
        const arcMat = new THREE.LineBasicMaterial({
            color: 0xFFD966,
            transparent: true,
            opacity: 0.4,
        });
        arcLine = new THREE.Line(arcGeo, arcMat);
        scene.add(arcLine);

        for (let i = 0; i < 3; i++) {
            const label = makeTextSprite("384,400 km", { fontsize: 18, color: "#FFD966" });
            label.material.sizeAttenuation = false;
            label.scale.set(0.04, 0.02, 1);
            scene.add(label);
            triangleLabels.push(label);
        }

        arcLabel = makeTextSprite("60°", { fontsize: 22, color: "#FFD966" });
        arcLabel.material.sizeAttenuation = false;
        arcLabel.scale.set(0.035, 0.018, 1);
        scene.add(arcLabel);
    }

    function updateTriangle(mPos, l4Pos) {
        const earthPos = new THREE.Vector3(0, 0, 0);
        const visible = showTriangle;

        triangleLine.visible = visible;
        arcLine.visible = visible;
        triangleLabels.forEach(l => l.visible = visible);
        arcLabel.visible = visible;

        if (!visible) return;

        const pos = triangleLine.geometry.attributes.position.array;
        pos[0] = earthPos.x; pos[1] = earthPos.y; pos[2] = earthPos.z;
        pos[3] = mPos.x; pos[4] = mPos.y; pos[5] = mPos.z;
        pos[6] = l4Pos.x; pos[7] = l4Pos.y; pos[8] = l4Pos.z;
        pos[9] = earthPos.x; pos[10] = earthPos.y; pos[11] = earthPos.z;
        triangleLine.geometry.attributes.position.needsUpdate = true;
        triangleLine.computeLineDistances();

        const arcPos = arcLine.geometry.attributes.position.array;
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const a = moonAngle + t * (Math.PI / 3);
            const arcR = MOON_ORBIT_R * 0.4;
            arcPos[i * 3] = arcR * Math.cos(a);
            arcPos[i * 3 + 1] = arcR * Math.sin(INCL) * Math.sin(a);
            arcPos[i * 3 + 2] = arcR * Math.sin(a);
        }
        arcLine.geometry.attributes.position.needsUpdate = true;

        const mid01 = earthPos.clone().add(mPos).multiplyScalar(0.5);
        mid01.y += 4;
        triangleLabels[0].position.copy(mid01);

        const mid12 = mPos.clone().add(l4Pos).multiplyScalar(0.5);
        mid12.y += 4;
        triangleLabels[1].position.copy(mid12);

        const mid20 = l4Pos.clone().add(earthPos).multiplyScalar(0.5);
        mid20.y += 4;
        triangleLabels[2].position.copy(mid20);

        const aMid = moonAngle + Math.PI / 6;
        const arcMidR = MOON_ORBIT_R * 0.4 + 6;
        arcLabel.position.set(
            arcMidR * Math.cos(aMid),
            arcMidR * Math.sin(INCL) * Math.sin(aMid) + 3,
            arcMidR * Math.sin(aMid)
        );
    }

    // ============================================================
    //  10. ORBITAL RING & ECLIPTIC
    // ============================================================
    let orbitalRing, eclipticGrid, orbitTraces = [];

    function createOrbitalRing() {
        // Main Moon orbit ring
        const ringPoints = [];
        for (let i = 0; i <= 128; i++) {
            const a = (i / 128) * TWO_PI;
            ringPoints.push(new THREE.Vector3(
                MOON_ORBIT_R * Math.cos(a),
                MOON_ORBIT_R * Math.sin(INCL) * Math.sin(a),
                MOON_ORBIT_R * Math.sin(a)
            ));
        }
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
        orbitalRing = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({
            color: 0x334466,
            transparent: true,
            opacity: 0.4,
        }));
        scene.add(orbitalRing);

        // L-point trace rings (subtle)
        const traceConfigs = [
            { ratio: L1_RATIO, color: COL.L1, opacity: 0.06 },
            { ratio: L2_RATIO, color: COL.L2, opacity: 0.06 },
            { ratio: 1.0, color: COL.L3, opacity: 0.04 },
        ];
        for (const tc of traceConfigs) {
            const pts = [];
            const r = MOON_ORBIT_R * tc.ratio;
            for (let i = 0; i <= 128; i++) {
                const a = (i / 128) * TWO_PI;
                pts.push(new THREE.Vector3(
                    r * Math.cos(a),
                    r * Math.sin(INCL) * Math.sin(a),
                    r * Math.sin(a)
                ));
            }
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            const trace = new THREE.Line(g, new THREE.LineBasicMaterial({
                color: tc.color,
                transparent: true,
                opacity: tc.opacity,
            }));
            scene.add(trace);
            orbitTraces.push(trace);
        }

        // Ecliptic plane grid
        eclipticGrid = new THREE.GridHelper(350, 25, 0x112244, 0x112244);
        eclipticGrid.material.transparent = true;
        eclipticGrid.material.opacity = 0.04;
        scene.add(eclipticGrid);
    }

    // ============================================================
    //  11. GRAVITY FIELD VISUALIZATION
    // ============================================================
    let fieldParticles;

    function createGravityField() {
        const count = isLowEnd ? 300 : 800;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const a = Math.random() * TWO_PI;
            const r = 20 + Math.random() * 160;
            positions[i * 3] = Math.cos(a) * r;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
            positions[i * 3 + 2] = Math.sin(a) * r;

            // Color based on distance from center (potential gradient)
            const normalized = r / 160;
            colors[i * 3] = 1.0 - normalized * 0.5;
            colors[i * 3 + 1] = 0.3 + normalized * 0.3;
            colors[i * 3 + 2] = 0.8 + normalized * 0.2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        fieldParticles = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 0.6,
            vertexColors: true,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        fieldParticles.visible = false;
        scene.add(fieldParticles);
    }

    function updateGravityField(lp, t) {
        if (!fieldParticles) return;
        fieldParticles.visible = showField;
        if (!showField) return;

        const positions = fieldParticles.geometry.attributes.position.array;
        const count = positions.length / 3;

        for (let i = 0; i < count; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];
            const pos = new THREE.Vector3(x, 0, z);

            // Combined gravitational influence
            let fx = 0, fz = 0;

            // Earth pull
            const dE = pos.length() || 0.1;
            fx -= (x / dE) * 800 / (dE * dE);
            fz -= (z / dE) * 800 / (dE * dE);

            // Moon pull
            const mPos = moonPos(moonAngle);
            const dmx = x - mPos.x, dmz = z - mPos.z;
            const dM = Math.sqrt(dmx * dmx + dmz * dmz) || 0.1;
            fx -= (dmx / dM) * 80 / (dM * dM);
            fz -= (dmz / dM) * 80 / (dM * dM);

            // Centrifugal pseudo-force
            const omega = TWO_PI / (MOON_PERIOD_DAYS * 86400);
            fx += x * omega * omega * 5000;
            fz += z * omega * omega * 5000;

            // Gentle drift
            const drift = 0.015;
            positions[i * 3] += fx * drift + Math.sin(t + i) * 0.01;
            positions[i * 3 + 2] += fz * drift + Math.cos(t + i * 0.7) * 0.01;

            // Keep in bounds
            const d = Math.sqrt(positions[i * 3] ** 2 + positions[i * 3 + 2] ** 2);
            if (d > 180 || d < 15) {
                const a = Math.random() * TWO_PI;
                const r = 20 + Math.random() * 160;
                positions[i * 3] = Math.cos(a) * r;
                positions[i * 3 + 2] = Math.sin(a) * r;
            }
        }

        fieldParticles.geometry.attributes.position.needsUpdate = true;
    }

    // ============================================================
    //  12. CARGO ROUTES (Moon→L4, Earth→L4)
    // ============================================================
    let cargoRoutes = [];
    const NUM_SHIPS_PER_ROUTE = 3;

    function createCargoRoutes() {
        const routeConfigs = [
            { name: "Moon→L4", color: COL.cargo, type: "moon-l4" },
            { name: "Earth→L4", color: 0x4fc3f7, type: "earth-l4" },
            { name: "L4→L5", color: 0xA29BFE, type: "l4-l5" },
        ];

        for (const config of routeConfigs) {
            const pathGeo = new THREE.BufferGeometry();
            const pathPos = new Float32Array(60 * 3);
            pathGeo.setAttribute("position", new THREE.BufferAttribute(pathPos, 3));
            const pathMat = new THREE.LineDashedMaterial({
                color: config.color,
                dashSize: 2,
                gapSize: 1.5,
                transparent: true,
                opacity: 0.4,
            });
            const line = new THREE.Line(pathGeo, pathMat);
            line.visible = false;
            scene.add(line);

            const ships = [];
            for (let i = 0; i < NUM_SHIPS_PER_ROUTE; i++) {
                const shipGroup = new THREE.Group();

                // Ship body
                const bodyGeo = new THREE.SphereGeometry(0.6, 10, 10);
                const bodyMat = new THREE.MeshPhongMaterial({
                    color: config.color,
                    emissive: config.color,
                    emissiveIntensity: 0.7,
                });
                const body = new THREE.Mesh(bodyGeo, bodyMat);
                shipGroup.add(body);

                // Engine trail
                const trailGeo = new THREE.ConeGeometry(0.3, 2.5, 8);
                const trailMat = new THREE.MeshBasicMaterial({
                    color: config.color,
                    transparent: true,
                    opacity: 0.3,
                    blending: THREE.AdditiveBlending,
                });
                const trail = new THREE.Mesh(trailGeo, trailMat);
                trail.rotation.x = Math.PI;
                trail.position.y = -1.5;
                shipGroup.add(trail);

                shipGroup.visible = false;
                shipGroup.userData.progress = i / NUM_SHIPS_PER_ROUTE;
                scene.add(shipGroup);
                ships.push(shipGroup);
            }

            cargoRoutes.push({
                ...config,
                line,
                ships,
            });
        }
    }

    function updateCargoRoutes(mPos, l4Pos, l5Pos, dt) {
        const visible = showCargo;

        for (const route of cargoRoutes) {
            route.line.visible = visible;
            route.ships.forEach(s => s.visible = visible);
            if (!visible) continue;

            let startPos, endPos, bulgeDir;

            if (route.type === "moon-l4") {
                startPos = mPos;
                endPos = l4Pos;
            } else if (route.type === "earth-l4") {
                startPos = new THREE.Vector3(0, 0, 0);
                endPos = l4Pos;
            } else {
                startPos = l4Pos;
                endPos = l5Pos;
            }

            // Control point
            const mid = startPos.clone().add(endPos).multiplyScalar(0.5);
            const pushDir = mid.clone().normalize();
            const ctrl = mid.clone().add(pushDir.multiplyScalar(route.type === "l4-l5" ? -30 : 35));
            ctrl.y += route.type === "earth-l4" ? 20 : 12;

            // Sample path
            const pathPos = route.line.geometry.attributes.position.array;
            for (let i = 0; i < 60; i++) {
                const t = i / 59;
                const p = bezierPoint(startPos, ctrl, endPos, t);
                pathPos[i * 3] = p.x;
                pathPos[i * 3 + 1] = p.y;
                pathPos[i * 3 + 2] = p.z;
            }
            route.line.geometry.attributes.position.needsUpdate = true;
            route.line.computeLineDistances();

            // Animate ships
            for (const ship of route.ships) {
                ship.userData.progress += dt * 0.025;
                if (ship.userData.progress > 1) ship.userData.progress -= 1;
                const p = bezierPoint(startPos, ctrl, endPos, ship.userData.progress);
                ship.position.copy(p);

                // Orient ship along path
                const nextT = Math.min(ship.userData.progress + 0.02, 1);
                const nextP = bezierPoint(startPos, ctrl, endPos, nextT);
                ship.lookAt(nextP);

                // Pulse engine trail
                const trail = ship.children[1];
                if (trail) {
                    trail.material.opacity = 0.2 + 0.15 * Math.sin(performance.now() * 0.005 + ship.userData.progress * 10);
                }
            }
        }

        // Update CASSSC counter
        const telCasssc = document.getElementById("telCasssc");
        if (telCasssc) telCasssc.textContent = visible ? (NUM_SHIPS_PER_ROUTE * 3).toString() : "0";
    }

    function bezierPoint(p0, p1, p2, t) {
        const inv = 1 - t;
        return new THREE.Vector3(
            inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
            inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
            inv * inv * p0.z + 2 * inv * t * p1.z + t * t * p2.z,
        );
    }

    // ============================================================
    //  13. CAMERA CONTROLS
    // ============================================================
    function updateCamera(dt) {
        if (cinematicMode) {
            cinematicTime += dt * 0.15;
            targetCamTheta = cinematicTime;
            targetCamPhi = Math.PI * 0.3 + Math.sin(cinematicTime * 0.3) * 0.15;
            targetCamR = 280 + Math.sin(cinematicTime * 0.5) * 60;
        }

        // Smooth interpolation
        camR += (targetCamR - camR) * Math.min(dt * 3, 1);
        camTheta += (targetCamTheta - camTheta) * Math.min(dt * 3, 1);
        camPhi += (targetCamPhi - camPhi) * Math.min(dt * 3, 1);

        // Clamp
        camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi));
        camR = Math.max(30, Math.min(800, camR));

        camera.position.set(
            camR * Math.sin(camPhi) * Math.cos(camTheta),
            camR * Math.cos(camPhi),
            camR * Math.sin(camPhi) * Math.sin(camTheta)
        );
        camera.lookAt(0, 0, 0);
    }

    // Camera presets
    function setCamPreset(preset) {
        cinematicMode = false;
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));

        switch (preset) {
            case 'overview':
                targetCamR = 320;
                targetCamTheta = Math.PI * 0.25;
                targetCamPhi = Math.PI * 0.35;
                document.getElementById('camOverview').classList.add('active');
                break;
            case 'bellevistat':
                // Aim at L4 position
                const l4a = moonAngle + Math.PI / 3;
                targetCamTheta = l4a + 0.3;
                targetCamPhi = Math.PI * 0.4;
                targetCamR = 50;
                document.getElementById('camBellevistat').classList.add('active');
                break;
            case 'top':
                targetCamR = 250;
                targetCamTheta = 0;
                targetCamPhi = 0.15;
                document.getElementById('camTop').classList.add('active');
                break;
            case 'cinematic':
                cinematicMode = true;
                cinematicTime = camTheta;
                document.getElementById('camCinematic').classList.add('active');
                break;
        }
    }

    // Mouse controls
    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        prevMouse.x = e.clientX;
        prevMouse.y = e.clientY;
        cinematicMode = false;
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
    });
    window.addEventListener("mouseup", () => isDragging = false);
    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        targetCamTheta -= dx * 0.005;
        targetCamPhi -= dy * 0.005;
        camTheta = targetCamTheta;
        camPhi = targetCamPhi;
        prevMouse.x = e.clientX;
        prevMouse.y = e.clientY;
    });
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        targetCamR += e.deltaY * 0.25;
        camR = targetCamR;
    }, { passive: false });

    // Touch Settings
    const touchSensitivity = globalIsMobile ? 0.012 : 0.005;

    canvas.addEventListener("touchstart", (e) => {
        cinematicMode = false;
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        isDragging = true;
        prevMouse.x = e.touches[0].clientX;
        prevMouse.y = e.touches[0].clientY;
        if (e.touches.length === 2) {
            lastTouchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - prevMouse.x;
            const dy = e.touches[0].clientY - prevMouse.y;
            targetCamTheta -= dx * touchSensitivity;
            targetCamPhi -= dy * touchSensitivity;
            camTheta = targetCamTheta;
            camPhi = targetCamPhi;
            prevMouse.x = e.touches[0].clientX;
            prevMouse.y = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            targetCamR -= (dist - lastTouchDist) * 0.5;
            camR = targetCamR;
            lastTouchDist = dist;
        }
    }, { passive: false });
    canvas.addEventListener("touchend", () => isDragging = false);

    // ============================================================
    //  14. CLICK / TOOLTIP / INFO PANEL
    // ============================================================
    const tooltipEl = document.getElementById("tooltip");
    const infoPanel = document.getElementById("info-panel");

    canvas.addEventListener("click", (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(clickables, true);

        if (hits.length > 0) {
            const obj = hits[0].object;
            // Check if this object or its parent has station data
            const isStation = obj.userData.isStation ||
                (obj.parent && obj.parent === stationGroup);
            // Check if clicking L4
            const isL4 = obj.userData.name === "L4";

            if (isStation || isL4) {
                // Show info panel for station or L4
                infoPanel.classList.remove("hidden");
                hideTooltip();
            } else {
                showTooltip(e.clientX, e.clientY, obj.userData);
            }
        } else {
            hideTooltip();
        }
    });

    document.getElementById("closeInfoPanel").addEventListener("click", () => {
        infoPanel.classList.add("hidden");
    });

    function showTooltip(x, y, data) {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        let html = `<div class="tt-name">${data.name || "Unknown"}</div>`;
        if (data.info) {
            const lines = data.info.split("\n");
            lines.forEach(l => {
                if (l.trim()) html += `<div class="tt-row">${l}</div>`;
            });
        }

        tooltipEl.innerHTML = html;
        tooltipEl.classList.remove("hidden");

        const tx = Math.min(x + 15, window.innerWidth - 320);
        const ty = Math.min(y + 15, window.innerHeight - 250);
        tooltipEl.style.left = tx + "px";
        tooltipEl.style.top = ty + "px";

        tooltipTimeout = setTimeout(hideTooltip, 5000);
    }

    function hideTooltip() {
        tooltipEl.classList.add("hidden");
    }

    // ============================================================
    //  15. HUD BUTTON WIRING
    // ============================================================
    const btnPlayPause = document.getElementById("btnPlayPause");
    btnPlayPause.addEventListener("click", () => {
        playing = !playing;
        btnPlayPause.textContent = playing ? "❚❚" : "▶";
        btnPlayPause.classList.toggle("active", playing);
    });

    const speedSlider = document.getElementById("speedSlider");
    const speedValueEl = document.getElementById("speedValue");
    speedSlider.addEventListener("input", () => {
        speed = parseFloat(speedSlider.value);
        speedValueEl.textContent = speed.toFixed(1) + "×";
    });

    document.getElementById("btnTriangle").addEventListener("click", function () {
        showTriangle = !showTriangle;
        this.classList.toggle("active", showTriangle);
    });
    document.getElementById("btnLPoints").addEventListener("click", function () {
        showLPoints = !showLPoints;
        this.classList.toggle("active", showLPoints);
    });
    document.getElementById("btnOrbits").addEventListener("click", function () {
        showOrbits = !showOrbits;
        this.classList.toggle("active", showOrbits);
    });
    document.getElementById("btnCargo").addEventListener("click", function () {
        showCargo = !showCargo;
        this.classList.toggle("active", showCargo);
    });
    document.getElementById("btnField").addEventListener("click", function () {
        showField = !showField;
        this.classList.toggle("active", showField);
    });

    // Fullscreen button
    document.getElementById("btnFullscreen").addEventListener("click", function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    // Camera presets
    document.getElementById("camOverview").addEventListener("click", () => setCamPreset("overview"));
    document.getElementById("camBellevistat").addEventListener("click", () => setCamPreset("bellevistat"));
    document.getElementById("camTop").addEventListener("click", () => setCamPreset("top"));
    document.getElementById("camCinematic").addEventListener("click", () => setCamPreset("cinematic"));

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
        switch (e.key.toLowerCase()) {
            case " ":
                e.preventDefault();
                playing = !playing;
                playIcon.textContent = playing ? "❚❚" : "▶";
                btnPlayPause.classList.toggle("active", playing);
                break;
            case "1": setCamPreset("overview"); break;
            case "2": setCamPreset("bellevistat"); break;
            case "3": setCamPreset("top"); break;
            case "4": setCamPreset("cinematic"); break;
            case "t": document.getElementById("btnTriangle").click(); break;
            case "l": document.getElementById("btnLPoints").click(); break;
            case "o": document.getElementById("btnOrbits").click(); break;
            case "c": document.getElementById("btnCargo").click(); break;
            case "g": document.getElementById("btnField").click(); break;
            case "f": document.getElementById("btnFullscreen").click(); break;
            case "Escape": if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); break;
        }
    });

    // ============================================================
    //  16. TELEMETRY
    // ============================================================
    const telElapsed = document.getElementById("telElapsed");
    const telMoonAngle = document.getElementById("telMoonAngle");
    const telL4Angle = document.getElementById("telL4Angle");
    const fpsEl = document.getElementById("fpsCounter");

    function updateTelemetry(dt) {
        const totalSeconds = simTime;
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        telElapsed.textContent = `T+${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        const moonDeg = ((moonAngle * 180 / Math.PI) % 360 + 360) % 360;
        telMoonAngle.textContent = moonDeg.toFixed(2) + "°";
        const l4Deg = ((moonDeg + 60) % 360);
        telL4Angle.textContent = l4Deg.toFixed(2) + "°";

        // Power oscillation
        const power = (2.3 + Math.sin(performance.now() * 0.0003) * 0.2).toFixed(1);
        const telPower = document.getElementById("telPower");
        if (telPower) telPower.textContent = power + " GW";

        // FPS
        frameCount++;
        fpsAccum += dt;
        if (fpsAccum >= 0.5) {
            displayFps = Math.round(frameCount / fpsAccum);
            frameCount = 0;
            fpsAccum = 0;
        }
        if (fpsEl) fpsEl.textContent = displayFps + " FPS";
    }

    // ============================================================
    //  17. RESIZE
    // ============================================================
    window.addEventListener("resize", () => {
        const nowMobile = window.innerWidth < 768;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Update pixel ratio for resize
        if (composer && composer.passes) {
            composer.setSize(window.innerWidth, window.innerHeight);
        }
    });

    // ============================================================
    //  18. ANIMATION LOOP
    // ============================================================
    let prevTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        let dt = (now - prevTime) / 1000;
        prevTime = now;
        dt = Math.min(dt, 0.05);

        const t = now * 0.001;

        if (playing) {
            const simDt = dt * speed * 3600;
            simTime += simDt;

            const angularVelocity = (TWO_PI) / (MOON_PERIOD_DAYS * 86400);
            moonAngle += angularVelocity * simDt;
        }

        // ── Update positions ──────────────────────────────────
        // Moon
        const mPos = moonPos(moonAngle);
        moonMesh.position.copy(mPos);
        moonMesh.lookAt(0, 0, 0);
        if (moonGlow) moonGlow.position.copy(mPos);

        // Earth rotation
        if (earthMesh) {
            earthMesh.rotation.y += dt * speed * 0.3;
            cloudMesh.rotation.y += dt * speed * 0.35;
        }

        // L-points
        const lp = lPointPositions(moonAngle);

        for (const [name, mesh] of Object.entries(lPoints)) {
            mesh.position.copy(lp[name]);
            mesh.visible = showLPoints;

            if (!mesh.userData.stable) {
                const pulse = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + name.charCodeAt(1)));
                mesh.material.emissiveIntensity = pulse;
            }

            if (lGlowSprites[name]) {
                lGlowSprites[name].position.copy(lp[name]);
                lGlowSprites[name].visible = showLPoints;
                // Subtle pulsing for all glow sprites
                const glowPulse = 1.0 + Math.sin(t * 1.5 + name.charCodeAt(1) * 0.5) * 0.15;
                lGlowSprites[name].scale.setScalar(mesh.userData.stable ? 22 * glowPulse : 12 * glowPulse);
            }

            if (lLabels[name]) {
                lLabels[name].position.copy(lp[name]);
                lLabels[name].position.y += mesh.userData.stable ? 7 : 5;
                lLabels[name].visible = showLPoints;
            }
        }

        // Bellevistat station
        const l4Pos = lp["L4"];
        const l5Pos = lp["L5"];

        stationGroup.position.copy(l4Pos);
        // Rotate station components
        stationGroup.children.forEach(child => {
            if (child.userData.isBeacon) {
                // Blink beacons
                child.material.opacity = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + child.position.x));
            }
        });
        stationGroup.rotation.y += dt * 0.5;
        stationGroup.visible = showLPoints;

        stationLabel.position.copy(l4Pos);
        stationLabel.position.y += 12;
        stationLabel.visible = showLPoints;

        bellevGlow.position.copy(l4Pos);
        bellevGlow.intensity = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5));

        // Orbit particles around L4
        if (orbitParticles) {
            orbitParticles.position.copy(l4Pos);
            orbitParticles.rotation.y += dt * 0.08;
            orbitParticles.visible = showLPoints;
        }

        // Triangle
        updateTriangle(mPos, l4Pos);

        // Orbits
        if (orbitalRing) orbitalRing.visible = showOrbits;
        if (eclipticGrid) eclipticGrid.visible = showOrbits;
        orbitTraces.forEach(tr => tr.visible = showOrbits);

        // Gravity field
        updateGravityField(lp, t);

        // Cargo routes
        updateCargoRoutes(mPos, l4Pos, l5Pos, dt * speed);

        // Update other planets
        if (otherPlanets && otherPlanets.length > 0) {
            otherPlanets.forEach(pMesh => {
                pMesh.userData.angle += dt * speed * pMesh.userData.speed * 0.005;
                pMesh.position.set(
                    sunPos.x + Math.cos(pMesh.userData.angle) * pMesh.userData.orbitDist,
                    sunPos.y + Math.sin(pMesh.userData.angle * 0.5) * 50, // Slight inclination
                    sunPos.z + Math.sin(pMesh.userData.angle) * pMesh.userData.orbitDist
                );
            });
            if (sunGroup) {
                sunGroup.rotation.y += dt * speed * 0.02;
                if (sunGroup.userData.shaderMat) {
                    sunGroup.userData.shaderMat.uniforms.time.value += dt * speed * 1.5;
                }
            }
        }

        // Camera
        updateCamera(dt);

        // Telemetry
        updateTelemetry(dt);

        if (composer) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }

        // Force dismiss loading overlay on first frame
        const loadingOverlay = document.getElementById("loading-overlay");
        if (loadingOverlay && loadingOverlay.style.display !== "none" && loadingOverlay.classList.contains("fade-out") === false) {
            loadingOverlay.classList.add("fade-out");
            setTimeout(() => {
                if (loadingOverlay) loadingOverlay.style.display = "none";
            }, 1000);
        }
    }

    // ============================================================
    //  INIT
    // ============================================================
    function init() {
        // Force dismiss loading overlay as a safety measure
        const failSafeTimeout = setTimeout(() => {
            const overlay = document.getElementById("loading-overlay");
            if (overlay && overlay.style.display !== "none") {
                console.warn("Loading timeout: forcing dismissal");
                overlay.classList.add("fade-out");
                setTimeout(() => overlay.style.display = "none", 1000);
            }
        }, 8000);

        // Check if landscape overlay should be shown (only on mobile portrait mode)
        function checkLandscapePrompt() {
            const isMobileScreen = window.innerWidth < 768;
            const isPortrait = window.innerHeight > window.innerWidth;
            const landscapeOverlay = document.getElementById("landscape-overlay");
            if (isMobileScreen && isPortrait && landscapeOverlay) {
                landscapeOverlay.style.display = "flex";
            }
        }

        // Check on load and on resize
        checkLandscapePrompt();
        window.addEventListener("resize", checkLandscapePrompt);

        try {
            createStars();
            createLights();
            createEarth();
            createMoon();
            createAllLPoints();
            setLPointInfos();
            createBellevistat();
            createSolarSystem();
            createOrbitParticles();
            createTriangle();
            createOrbitalRing();
            createGravityField();
            createCargoRoutes();

            updateCamera(0);

            // Dismiss loading overlay
            setTimeout(() => {
                const overlay = document.getElementById("loading-overlay");
                if (overlay) {
                    overlay.classList.add("fade-out");
                    setTimeout(() => overlay.style.display = "none", 1000);
                    clearTimeout(failSafeTimeout);
                }
            }, 1000);

            animate();
        } catch (error) {
            console.error("Initialization failed:", error);
            // Dismiss loader anyway so player can see what's wrong
            const overlay = document.getElementById("loading-overlay");
            if (overlay) {
                overlay.classList.add("fade-out");
                setTimeout(() => overlay.style.display = "none", 1000);
            }
            // Show a small error hint instead of a total hang
            const subText = document.querySelector(".loader-sub");
            if (subText) subText.textContent = "SYSTEM ERROR DETECTED. ATTEMPTING PARTIAL RECOVERY...";
        }
    }

    // Sidebar Toggle Logic
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            toggleBtn.classList.toggle('active');
            sidebar.classList.toggle('open');
        });
    }

    // ── Post-Processing (Bloom) ───────────────────────────────
    let composer;
    try {
        if (!isLowEnd) {
            const renderScene = new THREE.RenderPass(scene, camera);
            const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
            bloomPass.threshold = 0.85;
            bloomPass.strength = 0.6;
            bloomPass.radius = 0.5;
            
            composer = new THREE.EffectComposer(renderer);
            composer.addPass(renderScene);
            composer.addPass(bloomPass);
        }
    } catch(e) {
        console.warn("Post-processing failed, falling back to basic renderer:", e);
    }

    init();
})();
