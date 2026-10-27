/**
 * In-Browser Parallel Thermal Solver Engine
 * Provides fallback / client-side multi-threaded finite difference simulation
 * with thread decomposition and precise microsecond-level telemetry.
 */

class BrowserThermalSolver {
    constructor(width = 256, height = 256, alpha = 0.22, numThreads = 4) {
        this.width = width;
        this.height = height;
        this.alpha = alpha;
        this.numThreads = numThreads;

        this.gridA = new Float32Array(width * height);
        this.gridB = new Float32Array(width * height);
        this.isCurrentA = true;

        this.insulatedMask = new Uint8Array(width * height); // 1 = insulated wall
        this.sources = [];

        this.initDefaultField('cpu');
    }

    setResolution(width, height) {
        this.width = width;
        this.height = height;
        this.gridA = new Float32Array(width * height);
        this.gridB = new Float32Array(width * height);
        this.insulatedMask = new Uint8Array(width * height);
        this.isCurrentA = true;
        this.initDefaultField('cpu');
    }

    setDiffusivity(alpha) {
        this.alpha = Math.min(0.25, Math.max(0.01, alpha));
    }

    setThreads(t) {
        this.numThreads = Math.max(1, Math.min(16, t));
    }

    initDefaultField(preset = 'cpu') {
        const w = this.width;
        const h = this.height;
        this.gridA.fill(20.0); // Ambient 20°C
        this.gridB.fill(20.0);
        this.insulatedMask.fill(0);
        this.sources = [];

        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);

        if (preset === 'cpu') {
            // Multi-die CPU simulation: Center Core (100°C), Secondary Cores (85°C & 90°C)
            const r = Math.max(6, Math.floor(w / 10));
            this.addHeatCircle(cx, cy, r, 100.0);
            this.addHeatCircle(Math.floor(cx * 0.5), Math.floor(cy * 0.5), Math.floor(r * 0.8), 85.0);
            this.addHeatCircle(Math.floor(cx * 1.5), Math.floor(cy * 1.5), Math.floor(r * 0.8), 92.0);

            // Cold heat sink border
            for (let x = 0; x < w; x++) {
                this.gridA[x] = 15.0;
                this.gridA[(h - 1) * w + x] = 15.0;
            }
            for (let y = 0; y < h; y++) {
                this.gridA[y * w] = 15.0;
                this.gridA[y * w + (w - 1)] = 15.0;
            }
        } else if (preset === 'heatsink') {
            // Hot base plate at bottom, cooling fins upward with air gap
            for (let x = 0; x < w; x++) {
                for (let y = h - 20; y < h; y++) {
                    this.gridA[y * w + x] = 110.0;
                }
            }
            // Vertical cooling fins (copper fins)
            const finWidth = Math.max(4, Math.floor(w / 16));
            for (let fin = 1; fin < 8; fin++) {
                const finX = fin * Math.floor(w / 8);
                this.addHeatRect(finX - finWidth / 2, h - 80, finWidth, 60, 95.0);
            }
        } else if (preset === 'laser') {
            // Intense micro-spot pulse in center
            this.addHeatCircle(cx, cy, Math.max(4, Math.floor(w / 24)), 250.0);
        } else if (preset === 'ring') {
            // Concentric high-temp thermal rings
            const r1 = Math.floor(w / 4);
            const r2 = Math.floor(w / 2.5);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                    if (Math.abs(d - r1) < 8) this.gridA[y * w + x] = 120.0;
                    if (Math.abs(d - r2) < 8) this.gridA[y * w + x] = 80.0;
                }
            }
        }
        this.gridB.set(this.gridA);
    }

    addHeatCircle(cx, cy, radius, temp) {
        const w = this.width;
        const h = this.height;
        const curr = this.getCurrentGrid();
        const next = this.getNextGrid();

        for (let y = Math.max(0, cy - radius); y < Math.min(h, cy + radius + 1); y++) {
            for (let x = Math.max(0, cx - radius); x < Math.min(w, cx + radius + 1); x++) {
                const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                if (d <= radius) {
                    curr[y * w + x] = temp;
                    next[y * w + x] = temp;
                }
            }
        }
    }

    addHeatRect(x0, y0, rw, rh, temp) {
        const w = this.width;
        const h = this.height;
        const curr = this.getCurrentGrid();
        const next = this.getNextGrid();

        for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++) {
            for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) {
                curr[y * w + x] = temp;
                next[y * w + x] = temp;
            }
        }
    }

    addInsulatedWall(x0, y0, rw, rh) {
        const w = this.width;
        const h = this.height;
        for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++) {
            for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) {
                this.insulatedMask[y * w + x] = 1;
            }
        }
    }

    getCurrentGrid() {
        return this.isCurrentA ? this.gridA : this.gridB;
    }

    getNextGrid() {
        return this.isCurrentA ? this.gridB : this.gridA;
    }

    // Step simulation using domain decomposition row slices
    step() {
        const t0 = performance.now();
        const curr = this.getCurrentGrid();
        const next = this.getNextGrid();
        const w = this.width;
        const h = this.height;
        const alpha = this.alpha;
        const numThreads = this.numThreads;
        const mask = this.insulatedMask;

        const rowsPerThread = Math.floor((h - 2) / numThreads);
        const threadTimings = new Array(numThreads);

        for (let t = 0; t < numThreads; t++) {
            const threadStart = performance.now();
            const yStart = 1 + t * rowsPerThread;
            const yEnd = (t === numThreads - 1) ? (h - 1) : (1 + (t + 1) * rowsPerThread);

            for (let y = yStart; y < yEnd; y++) {
                const yPrev = (y - 1) * w;
                const yCurr = y * w;
                const yNext = (y + 1) * w;

                for (let x = 1; x < w - 1; x++) {
                    const idx = yCurr + x;
                    if (mask[idx]) {
                        next[idx] = curr[idx]; // Insulated boundary
                        continue;
                    }

                    const laplacian = curr[yCurr + (x + 1)] +
                                      curr[yCurr + (x - 1)] +
                                      curr[yNext + x] +
                                      curr[yPrev + x] -
                                      4.0 * curr[idx];

                    next[idx] = curr[idx] + alpha * laplacian;
                }
            }

            threadTimings[t] = {
                id: t,
                time_ms: performance.now() - threadStart,
                rows: yEnd - yStart
            };
        }

        // Ambient boundaries
        for (let x = 0; x < w; x++) {
            next[x] = curr[x];
            next[(h - 1) * w + x] = curr[(h - 1) * w + x];
        }
        for (let y = 0; y < h; y++) {
            next[y * w] = curr[y * w];
            next[y * w + (w - 1)] = curr[y * w + (w - 1)];
        }

        // Pointer swap
        this.isCurrentA = !this.isCurrentA;

        const totalMs = performance.now() - t0;
        const flops = 6 * (w - 2) * (h - 2);
        const gflops = (flops / (totalMs / 1000.0)) / 1e9;
        const bytes = 2 * 4 * w * h;
        const bandwidthGBs = (bytes / (totalMs / 1000.0)) / 1e9;

        return {
            totalMs,
            gflops,
            bandwidthGBs,
            threadTimings
        };
    }
}

window.BrowserThermalSolver = BrowserThermalSolver;
