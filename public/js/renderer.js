/**
 * Thermal Renderer: High-performance 2D Canvas & WebGL Colormap Engine
 * Features: Inferno, Turbo, Cool-Warm, Viridis, Flame Colormaps
 * Domain Decomposition Thread Slicing Visualizer
 * Fourier Heat Flux Vector Field Overlay
 */

class ThermalRenderer {
    constructor(heatCanvas, overlayCanvas) {
        this.canvas = heatCanvas;
        this.ctx = heatCanvas.getContext('2d', { willReadFrequently: true });
        this.overlayCanvas = overlayCanvas;
        this.overlayCtx = overlayCanvas.getContext('2d');

        this.colormapName = 'inferno';
        this.colormapTable = this.generateColormapTable('inferno');

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        this.threadColors = [
            'rgba(0, 240, 255, 0.22)',   // Thread 0: Cyan
            'rgba(255, 107, 53, 0.22)',  // Thread 1: Amber
            'rgba(16, 185, 129, 0.22)',  // Thread 2: Emerald
            'rgba(139, 92, 246, 0.22)',  // Thread 3: Purple
            'rgba(236, 72, 153, 0.22)',  // Thread 4: Pink
            'rgba(234, 179, 8, 0.22)',   // Thread 5: Yellow
            'rgba(59, 130, 246, 0.22)',  // Thread 6: Blue
            'rgba(20, 184, 166, 0.22)'   // Thread 7: Teal
        ];
    }

    setColormap(name) {
        this.colormapName = name;
        this.colormapTable = this.generateColormapTable(name);
        this.updateLegendUI(name);
    }

    updateLegendUI(name) {
        const legend = document.getElementById('legendGradient');
        if (!legend) return;

        if (name === 'turbo') {
            legend.style.background = 'linear-gradient(to right, #30123b, #4145ab, #4675ed, #39a2fc, #1bcfd4, #24eca6, #61f46e, #a4fc3c, #d1e834, #f3c63a, #fe9b2d, #f36315, #d93806, #b11902, #7a0403)';
        } else if (name === 'coolwarm') {
            legend.style.background = 'linear-gradient(to right, #3b4cc0, #6f92f3, #abc2f6, #dddddd, #f4b29c, #e26952, #b40426)';
        } else if (name === 'viridis') {
            legend.style.background = 'linear-gradient(to right, #440154, #482878, #3e4989, #31688e, #26828e, #1f9e89, #35b779, #6ece58, #b5de2b, #fde725)';
        } else if (name === 'flame') {
            legend.style.background = 'linear-gradient(to right, #000000, #800000, #ff0000, #ff8000, #ffff00, #ffffff)';
        } else {
            // Inferno
            legend.style.background = 'linear-gradient(to right, #000004, #420a68, #932b80, #dd513a, #fca50a, #fcffa4)';
        }
    }

    // Generate 256-entry RGB lookup table
    generateColormapTable(type) {
        const table = new Uint8Array(256 * 3);

        for (let i = 0; i < 256; i++) {
            const t = i / 255.0;
            let r = 0, g = 0, b = 0;

            if (type === 'turbo') {
                // Approximate Google Turbo colormap polynomial
                const kRedVec4 = [0.13572138, 4.61539260, -42.66032258, 132.13108234, -152.94239396, 59.28637943];
                const kGreenVec4 = [0.09140261, 2.19418839, 4.84296658, -14.18503327, 4.27729857, 2.82956604];
                const kBlueVec4 = [0.10667330, 12.64194608, -60.58204836, 110.36276771, -89.90310912, 27.34824973];

                const poly = (c, x) => c[0] + x * (c[1] + x * (c[2] + x * (c[3] + x * (c[4] + x * c[5]))));
                r = Math.min(255, Math.max(0, Math.round(poly(kRedVec4, t) * 255)));
                g = Math.min(255, Math.max(0, Math.round(poly(kGreenVec4, t) * 255)));
                b = Math.min(255, Math.max(0, Math.round(poly(kBlueVec4, t) * 255)));
            } else if (type === 'coolwarm') {
                // Divergent blue to red
                r = Math.round(Math.min(255, Math.max(0, (Math.sin((t - 0.25) * Math.PI) * 0.5 + 0.5) * 255 * (t > 0.5 ? 1 : 0.6) + (t > 0.5 ? (t - 0.5) * 2 * 200 : 0))));
                g = Math.round(Math.min(255, Math.max(0, Math.sin(t * Math.PI) * 200)));
                b = Math.round(Math.min(255, Math.max(0, (1 - t) * 255)));
            } else if (type === 'viridis') {
                // Viridis approximation
                r = Math.round(Math.min(255, Math.max(0, (0.2 + 0.8 * Math.pow(t, 2)) * 255)));
                g = Math.round(Math.min(255, Math.max(0, (0.05 + 0.9 * t) * 255)));
                b = Math.round(Math.min(255, Math.max(0, (0.4 + 0.5 * Math.sin(t * Math.PI * 1.5)) * 255)));
            } else if (type === 'flame') {
                // High contrast metal flame
                if (t < 0.25) {
                    r = Math.round(t * 4 * 160); g = 0; b = 0;
                } else if (t < 0.5) {
                    r = 255; g = Math.round((t - 0.25) * 4 * 140); b = 0;
                } else if (t < 0.75) {
                    r = 255; g = Math.round(140 + (t - 0.5) * 4 * 115); b = 0;
                } else {
                    r = 255; g = 255; b = Math.round((t - 0.75) * 4 * 255);
                }
            } else {
                // Inferno approximation
                if (t < 0.25) {
                    r = Math.round(t * 4 * 80);
                    g = Math.round(t * 4 * 10);
                    b = Math.round(t * 4 * 110);
                } else if (t < 0.5) {
                    r = Math.round(80 + (t - 0.25) * 4 * 110);
                    g = Math.round(10 + (t - 0.25) * 4 * 40);
                    b = Math.round(110 - (t - 0.25) * 4 * 40);
                } else if (t < 0.75) {
                    r = Math.round(190 + (t - 0.5) * 4 * 55);
                    g = Math.round(50 + (t - 0.5) * 4 * 90);
                    b = Math.round(70 - (t - 0.5) * 4 * 60);
                } else {
                    r = 252;
                    g = Math.round(140 + (t - 0.75) * 4 * 115);
                    b = Math.round(10 + (t - 0.75) * 4 * 150);
                }
            }

            table[i * 3 + 0] = Math.min(255, Math.max(0, r));
            table[i * 3 + 1] = Math.min(255, Math.max(0, g));
            table[i * 3 + 2] = Math.min(255, Math.max(0, b));
        }

        return table;
    }

    // Render thermal grid
    renderGrid(grid, width, height, minTemp = 0.0, maxTemp = 120.0) {
        if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
            this.offscreenCanvas.width = width;
            this.offscreenCanvas.height = height;
            this.imgData = this.offscreenCtx.createImageData(width, height);
        }

        const data = this.imgData.data;
        const colormap = this.colormapTable;
        const range = Math.max(1.0, maxTemp - minTemp);
        const len = width * height;

        for (let i = 0; i < len; i++) {
            const temp = grid[i];
            const norm = Math.max(0, Math.min(255, Math.floor(((temp - minTemp) / range) * 255)));
            const cIdx = norm * 3;
            const pIdx = i * 4;

            data[pIdx + 0] = colormap[cIdx + 0]; // R
            data[pIdx + 1] = colormap[cIdx + 1]; // G
            data[pIdx + 2] = colormap[cIdx + 2]; // B
            data[pIdx + 3] = 255;                // A
        }

        this.offscreenCtx.putImageData(this.imgData, 0, 0);

        // Blit offscreen buffer smoothly scaled to main canvas
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.canvas.width, this.canvas.height);
    }

    // Render Thread Domain Decomposition Overlay
    renderThreadOverlay(numThreads, gridWidth, gridHeight, schedule = 'static') {
        const ctx = this.overlayCtx;
        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const rowsPerThread = gridHeight / numThreads;
        const scaleY = h / gridHeight;

        for (let t = 0; t < numThreads; t++) {
            const yStart = Math.floor(t * rowsPerThread * scaleY);
            const yHeight = Math.floor(rowsPerThread * scaleY);

            // Thread region tint
            ctx.fillStyle = this.threadColors[t % this.threadColors.length];
            ctx.fillRect(0, yStart, w, yHeight);

            // Boundary separator line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(0, yStart);
            ctx.lineTo(w, yStart);
            ctx.stroke();
            ctx.setLineDash([]);

            // Thread badge label
            ctx.fillStyle = 'rgba(6, 9, 15, 0.85)';
            ctx.fillRect(10, yStart + 6, 120, 20);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.strokeRect(10, yStart + 6, 120, 20);

            ctx.fillStyle = '#f0f4fc';
            ctx.font = 'bold 10px monospace';
            const rowFrom = Math.floor(t * rowsPerThread);
            const rowTo = Math.floor((t + 1) * rowsPerThread - 1);
            ctx.fillText(`Thread #${t}: [${rowFrom}-${rowTo}]`, 16, yStart + 20);
        }
    }

    // Render Fourier Heat Flux Vector Field (-k * grad(u))
    renderHeatFlux(grid, width, height) {
        const ctx = this.overlayCtx;
        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;

        const step = Math.max(16, Math.floor(width / 16));
        const cellW = w / width;
        const cellH = h / height;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;

        for (let y = step; y < height - step; y += step) {
            for (let x = step; x < width - step; x += step) {
                // Gradient du/dx, du/dy
                const dx = (grid[y * width + (x + 1)] - grid[y * width + (x - 1)]) * 0.5;
                const dy = (grid[(y + 1) * width + x] - grid[(y - 1) * width + x]) * 0.5;

                // Flux is opposite to gradient (hot -> cold)
                const qx = -dx;
                const qy = -dy;
                const mag = Math.sqrt(qx * qx + qy * qy);

                if (mag > 0.5) {
                    const normQx = (qx / mag) * Math.min(14, mag * 0.8);
                    const normQy = (qy / mag) * Math.min(14, mag * 0.8);

                    const px = x * cellW;
                    const py = y * cellH;

                    // Draw arrow
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + normQx, py + normQy);
                    ctx.stroke();

                    // Arrowhead
                    ctx.beginPath();
                    ctx.arc(px + normQx, py + normQy, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
}

window.ThermalRenderer = ThermalRenderer;
