/**
 * HPC Thermal Parallel Studio - Main Application Controller
 * Connects Canvas Renderer, In-Browser Solver, C++ OpenMP Backend & Charts.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Canvas & Renderers
    const heatCanvas = document.getElementById('heatCanvas');
    const overlayCanvas = document.getElementById('overlayCanvas');
    const renderer = new ThermalRenderer(heatCanvas, overlayCanvas);
    const charts = new ChartManager();

    // State Variables
    let currentResolution = 256;
    let currentAlpha = 0.22;
    let currentThreads = 4;
    let currentSchedule = 'static';
    let currentEngine = 'cpp'; // 'cpp' or 'worker'
    let currentTool = 'heat'; // 'heat', 'cool', 'insulate'
    let brushRadius = 16;
    let isRunning = false;
    let animFrameId = null;
    let ws = null;
    let isStreamingCpp = false;

    // In-browser solver
    const browserSolver = new BrowserThermalSolver(currentResolution, currentResolution, currentAlpha, currentThreads);

    // DOM Elements
    const btnPlayPause = document.getElementById('btnPlayPause');
    const playIcon = document.getElementById('playIcon');
    const playText = document.getElementById('playText');
    const btnStep = document.getElementById('btnStep');
    const btnReset = document.getElementById('btnReset');
    const sliderAlpha = document.getElementById('sliderAlpha');
    const valAlpha = document.getElementById('valAlpha');
    const cflStatus = document.getElementById('cflStatus');
    const sliderGrid = document.getElementById('sliderGrid');
    const valGrid = document.getElementById('valGrid');
    const sliderBrush = document.getElementById('sliderBrush');
    const valBrush = document.getElementById('valBrush');
    const selectColormap = document.getElementById('selectColormap');
    const selectSchedule = document.getElementById('selectSchedule');
    const toggleThreadOverlay = document.getElementById('toggleThreadOverlay');
    const toggleFlux = document.getElementById('toggleFlux');

    // Telemetry HUD Elements
    const hudFps = document.getElementById('hudFps');
    const hudStepTime = document.getElementById('hudStepTime');
    const hudGflops = document.getElementById('hudGflops');
    const hudBandwidth = document.getElementById('hudBandwidth');
    const threadSlicesVisual = document.getElementById('threadSlicesVisual');
    const threadStripMeta = document.getElementById('threadStripMeta');
    const activeThreadCountLabel = document.getElementById('activeThreadCountLabel');

    // FPS Counter
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let fpsTimer = performance.now();

    // ----------------------------------------------------
    // System Initialization & Telemetry
    // ----------------------------------------------------
    async function initSystemInfo() {
        try {
            const res = await fetch('/api/system');
            if (res.ok) {
                const sys = await res.json();
                document.getElementById('sysCpuModel').textContent = sys.cpuModel.split('@')[0].trim();
                document.getElementById('sysCores').textContent = `${sys.logicalCores} Threads`;
                document.getElementById('backendStatusText').textContent = 'C++ Native Connected';
                document.getElementById('backendBadge').className = 'telemetry-badge status-connected';
            }
        } catch (e) {
            console.warn('Backend server not detected or offline, defaulting to Web Worker mode');
            document.getElementById('backendStatusText').textContent = 'Web Workers Mode';
            document.getElementById('backendBadge').className = 'telemetry-badge';
            document.getElementById('btnEngineWorker').click();
        }
    }
    initSystemInfo();

    // ----------------------------------------------------
    // WebSocket Setup for Real-time C++ Streaming
    // ----------------------------------------------------
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket connection established with C++ OpenMP backend');
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'frame' && isRunning && currentEngine === 'cpp') {
                    handleCppFrame(msg.payload);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket closed, attempting reconnect in 3s');
                setTimeout(initWebSocket, 3000);
            };

            ws.onerror = (err) => {
                console.warn('WebSocket error, will use browser worker fallback:', err);
            };
        } catch (e) {
            console.error('WebSocket connection failed:', e);
        }
    }
    initWebSocket();

    function handleCppFrame(payload) {
        // payload: { f: frameIndex, ms: stepTime, th: threadCount, d: [pixel samples] }
        hudStepTime.textContent = `${payload.ms.toFixed(2)} ms`;
        const flops = 6 * (currentResolution - 2) * (currentResolution - 2);
        const gflops = ((flops / (payload.ms / 1000.0)) / 1e9).toFixed(1);
        hudGflops.textContent = `${gflops} GFLOPS`;
        const bw = (((2 * 4 * currentResolution * currentResolution) / (payload.ms / 1000.0)) / 1e9).toFixed(1);
        hudBandwidth.textContent = `${bw} GB/s`;

        // Render frame sample
        if (payload.d && payload.d.length > 0) {
            const res = Math.sqrt(payload.d.length);
            renderer.renderGrid(payload.d, res, res);
            renderOverlays(payload.d, res, res);
        }

        updateFps();
    }

    // ----------------------------------------------------
    // Simulation Loop (Browser Mode or C++ Trigger)
    // ----------------------------------------------------
    function simulationLoop() {
        if (!isRunning) return;

        if (currentEngine === 'worker') {
            const metrics = browserSolver.step();
            const grid = browserSolver.getCurrentGrid();
            const w = browserSolver.width;
            const h = browserSolver.height;

            renderer.renderGrid(grid, w, h);
            renderOverlays(grid, w, h);

            hudStepTime.textContent = `${metrics.totalMs.toFixed(2)} ms`;
            hudGflops.textContent = `${metrics.gflops.toFixed(1)} GFLOPS`;
            hudBandwidth.textContent = `${metrics.bandwidthGBs.toFixed(1)} GB/s`;
            updateFps();

            animFrameId = requestAnimationFrame(simulationLoop);
        }
    }

    function renderOverlays(grid, w, h) {
        if (toggleThreadOverlay.checked) {
            renderer.renderThreadOverlay(currentThreads, w, h, currentSchedule);
        } else {
            renderer.overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        if (toggleFlux.checked) {
            renderer.renderHeatFlux(grid, w, h);
        }
    }

    function updateFps() {
        frameCount++;
        const now = performance.now();
        if (now - fpsTimer >= 500) {
            const fps = ((frameCount * 1000) / (now - fpsTimer)).toFixed(1);
            hudFps.textContent = fps;
            frameCount = 0;
            fpsTimer = now;
        }
    }

    function startSimulation() {
        if (isRunning) return;
        isRunning = true;
        btnPlayPause.classList.add('running');
        playIcon.textContent = '⏸';
        playText.textContent = 'Pause Simulation';

        if (currentEngine === 'cpp' && ws && ws.readyState === WebSocket.OPEN) {
            isStreamingCpp = true;
            ws.send(JSON.stringify({
                type: 'start_stream',
                gridSize: currentResolution,
                steps: 5000,
                threads: currentThreads,
                schedule: currentSchedule,
                alpha: currentAlpha
            }));
        } else {
            simulationLoop();
        }
    }

    function pauseSimulation() {
        isRunning = false;
        btnPlayPause.classList.remove('running');
        playIcon.textContent = '▶';
        playText.textContent = 'Start Simulation';

        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        if (isStreamingCpp && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stop_stream' }));
            isStreamingCpp = false;
        }
    }

    btnPlayPause.addEventListener('click', () => {
        if (isRunning) pauseSimulation();
        else startSimulation();
    });

    btnStep.addEventListener('click', () => {
        pauseSimulation();
        browserSolver.step();
        const grid = browserSolver.getCurrentGrid();
        renderer.renderGrid(grid, browserSolver.width, browserSolver.height);
        renderOverlays(grid, browserSolver.width, browserSolver.height);
    });

    btnReset.addEventListener('click', () => {
        pauseSimulation();
        browserSolver.initDefaultField('cpu');
        const grid = browserSolver.getCurrentGrid();
        renderer.renderGrid(grid, browserSolver.width, browserSolver.height);
        renderOverlays(grid, browserSolver.width, browserSolver.height);
    });

    // ----------------------------------------------------
    // Engine & Thread Switching
    // ----------------------------------------------------
    document.querySelectorAll('.engine-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const newEngine = btn.dataset.engine;

            if (newEngine !== currentEngine) {
                const wasRunning = isRunning;
                pauseSimulation();
                currentEngine = newEngine;
                if (wasRunning) startSimulation();
            }
        });
    });

    document.querySelectorAll('.thread-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.thread-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentThreads = parseInt(chip.dataset.threads, 10);
            activeThreadCountLabel.textContent = `${currentThreads} Cores`;
            browserSolver.setThreads(currentThreads);
            updateThreadSlicesUI();

            if (isRunning && currentEngine === 'cpp' && ws && ws.readyState === WebSocket.OPEN) {
                // Restart C++ stream with new thread count
                ws.send(JSON.stringify({ type: 'stop_stream' }));
                setTimeout(() => {
                    if (isRunning) {
                        ws.send(JSON.stringify({
                            type: 'start_stream',
                            gridSize: currentResolution,
                            steps: 5000,
                            threads: currentThreads,
                            schedule: currentSchedule,
                            alpha: currentAlpha
                        }));
                    }
                }, 100);
            }

            renderOverlays(browserSolver.getCurrentGrid(), browserSolver.width, browserSolver.height);
        });
    });

    function updateThreadSlicesUI() {
        threadSlicesVisual.innerHTML = '';
        threadStripMeta.textContent = `${currentThreads} Threads Active • ${currentSchedule.toUpperCase()} Decomposition`;

        const colors = [
            '#00f0ff', '#ff6b35', '#10b981', '#8b5cf6',
            '#ec4899', '#eab308', '#3b82f6', '#14b8a6'
        ];

        const rowsPerThread = Math.floor(currentResolution / currentThreads);

        for (let t = 0; t < currentThreads; t++) {
            const slice = document.createElement('div');
            slice.className = 'thread-slice';
            slice.style.background = colors[t % colors.length];
            slice.style.color = '#06090f';
            slice.textContent = `T#${t}`;
            slice.title = `Thread #${t}: ${rowsPerThread} rows (${rowsPerThread * currentResolution} cells)`;
            threadSlicesVisual.appendChild(slice);
        }
    }
    updateThreadSlicesUI();

    selectSchedule.addEventListener('change', (e) => {
        currentSchedule = e.target.value;
        updateThreadSlicesUI();
    });

    // ----------------------------------------------------
    // Physical Parameters & Sliders
    // ----------------------------------------------------
    sliderAlpha.addEventListener('input', (e) => {
        currentAlpha = parseFloat(e.target.value);
        valAlpha.textContent = currentAlpha.toFixed(2);
        browserSolver.setDiffusivity(currentAlpha);

        if (currentAlpha > 0.25) {
            cflStatus.className = 'cfl-indicator warn';
            cflStatus.innerHTML = '⚠️ Unstable (CFL > 0.25)';
        } else {
            cflStatus.className = 'cfl-indicator ok';
            cflStatus.innerHTML = '✓ Stable (CFL &le; 0.25)';
        }
    });

    sliderGrid.addEventListener('input', (e) => {
        currentResolution = parseInt(e.target.value, 10);
        valGrid.innerHTML = `${currentResolution} &times; ${currentResolution}`;
        browserSolver.setResolution(currentResolution, currentResolution);
        updateThreadSlicesUI();
        const grid = browserSolver.getCurrentGrid();
        renderer.renderGrid(grid, currentResolution, currentResolution);
        renderOverlays(grid, currentResolution, currentResolution);
    });

    selectColormap.addEventListener('change', (e) => {
        renderer.setColormap(e.target.value);
        const grid = browserSolver.getCurrentGrid();
        renderer.renderGrid(grid, browserSolver.width, browserSolver.height);
    });

    toggleThreadOverlay.addEventListener('change', () => {
        renderOverlays(browserSolver.getCurrentGrid(), browserSolver.width, browserSolver.height);
    });

    toggleFlux.addEventListener('change', () => {
        renderOverlays(browserSolver.getCurrentGrid(), browserSolver.width, browserSolver.height);
    });

    // ----------------------------------------------------
    // Canvas Interactive Mouse Painting
    // ----------------------------------------------------
    let isMouseDown = false;

    function applyToolAtCanvasPoint(clientX, clientY) {
        const rect = heatCanvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        if (mouseX < 0 || mouseX > rect.width || mouseY < 0 || mouseY > rect.height) return;

        const gridX = Math.floor((mouseX / rect.width) * currentResolution);
        const gridY = Math.floor((mouseY / rect.height) * currentResolution);
        const radius = Math.floor((brushRadius / 512) * currentResolution);

        if (currentTool === 'heat') {
            browserSolver.addHeatCircle(gridX, gridY, radius, 140.0);
        } else if (currentTool === 'cool') {
            browserSolver.addHeatCircle(gridX, gridY, radius, 0.0);
        } else if (currentTool === 'insulate') {
            browserSolver.addInsulatedWall(gridX - radius, gridY - radius, radius * 2, radius * 2);
        }

        const grid = browserSolver.getCurrentGrid();
        renderer.renderGrid(grid, currentResolution, currentResolution);
        renderOverlays(grid, currentResolution, currentResolution);
    }

    heatCanvas.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        applyToolAtCanvasPoint(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
        if (isMouseDown) {
            applyToolAtCanvasPoint(e.clientX, e.clientY);
        }
    });

    window.addEventListener('mouseup', () => {
        isMouseDown = false;
    });

    // Touch support for mobile/tablets
    heatCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            isMouseDown = true;
            applyToolAtCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (isMouseDown && e.touches.length > 0) {
            applyToolAtCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
        isMouseDown = false;
    });

    // Tool Buttons
    const toolButtons = [
        { id: 'toolHeat', name: 'heat' },
        { id: 'toolCool', name: 'cool' },
        { id: 'toolInsulate', name: 'insulate' }
    ];

    toolButtons.forEach(tb => {
        const btn = document.getElementById(tb.id);
        if (btn) {
            btn.addEventListener('click', () => {
                toolButtons.forEach(t => document.getElementById(t.id).classList.remove('active'));
                btn.classList.add('active');
                currentTool = tb.name;
            });
        }
    });

    sliderBrush.addEventListener('input', (e) => {
        brushRadius = parseInt(e.target.value, 10);
        valBrush.textContent = `${brushRadius} px`;
    });

    // Presets
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            browserSolver.initDefaultField(preset);
            const grid = browserSolver.getCurrentGrid();
            renderer.renderGrid(grid, browserSolver.width, browserSolver.height);
            renderOverlays(grid, browserSolver.width, browserSolver.height);
        });
    });

    // ----------------------------------------------------
    // Benchmark Cockpit & Sweep Execution
    // ----------------------------------------------------
    const btnRunBenchmark = document.getElementById('btnRunBenchmark');
    const benchmarkTableBody = document.getElementById('benchmarkTableBody');
    const statMaxSpeedup = document.getElementById('statMaxSpeedup');
    const statAvgEfficiency = document.getElementById('statAvgEfficiency');
    const hpcInsightText = document.getElementById('hpcInsightText');

    btnRunBenchmark.addEventListener('click', async () => {
        btnRunBenchmark.disabled = true;
        btnRunBenchmark.innerHTML = '<span>⏳</span> Benchmarking...';

        try {
            const response = await fetch('/api/benchmark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gridSize: currentResolution,
                    steps: 100,
                    schedule: currentSchedule,
                    chunk: 16,
                    alpha: currentAlpha
                })
            });

            if (!response.ok) {
                throw new Error('Benchmark API request failed');
            }

            const data = await response.json();
            const results = data.results;

            // Render updated charts
            charts.renderSpeedupChart(results);
            charts.renderEfficiencyChart(results);
            charts.renderThroughputChart(results);

            // Populate table
            benchmarkTableBody.innerHTML = '';
            let maxSpeedup = 0;
            let sumEfficiency = 0;

            results.forEach(r => {
                if (r.speedup > maxSpeedup) maxSpeedup = r.speedup;
                sumEfficiency += r.efficiency;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${r.threads}T</strong> (${r.schedule})</td>
                    <td>${r.total_time_ms.toFixed(1)} ms</td>
                    <td style="color: ${r.speedup >= 1.0 ? '#10b981' : '#ff6b35'}">${r.speedup.toFixed(2)}x</td>
                    <td style="color: #00f0ff">${r.gflops.toFixed(1)}</td>
                    <td style="color: #38bdf8">${r.bandwidth_gb_s.toFixed(1)}</td>
                `;
                benchmarkTableBody.appendChild(tr);
            });

            statMaxSpeedup.textContent = `${maxSpeedup.toFixed(2)}x Peak`;
            const avgEff = ((sumEfficiency / results.length) * 100).toFixed(0);
            statAvgEfficiency.textContent = `${avgEff}% Avg`;

            hpcInsightText.innerHTML = `
                Grid ${data.system.grid_size}&times;${data.system.grid_size} hit <strong>${results[results.length - 1].bandwidth_gb_s.toFixed(1)} GB/s</strong> memory bandwidth on ${data.system.max_threads} OpenMP threads.
                Notice how scaling flattens as memory bus channels saturate, validating Roofline theoretical bounds.
            `;

        } catch (err) {
            console.error('Benchmark failed:', err);
            benchmarkTableBody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;text-align:center;">Failed to run C++ benchmark. Ensure server is active.</td></tr>`;
        } finally {
            btnRunBenchmark.disabled = false;
            btnRunBenchmark.innerHTML = '<span>⚡</span> Run Full Sweep';
        }
    });

    // ----------------------------------------------------
    // Theory Modal
    // ----------------------------------------------------
    const theoryModal = document.getElementById('theoryModal');
    const btnOpenTheory = document.getElementById('btnOpenTheory');
    const btnCloseTheory = document.getElementById('btnCloseTheory');
    const btnModalCloseAction = document.getElementById('btnModalCloseAction');

    btnOpenTheory.addEventListener('click', () => theoryModal.classList.add('open'));
    btnCloseTheory.addEventListener('click', () => theoryModal.classList.remove('open'));
    btnModalCloseAction.addEventListener('click', () => theoryModal.classList.remove('open'));

    theoryModal.addEventListener('click', (e) => {
        if (e.target === theoryModal) theoryModal.classList.remove('open');
    });

    // Initial render
    const initialGrid = browserSolver.getCurrentGrid();
    renderer.renderGrid(initialGrid, browserSolver.width, browserSolver.height);
    renderOverlays(initialGrid, browserSolver.width, browserSolver.height);
});
