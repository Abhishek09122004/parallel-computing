/**
 * Lightweight, dependency-free Canvas Chart Engine
 * Optimized for high-DPI displays with glowing Cyber-HPC aesthetic.
 */

class ChartManager {
    constructor() {
        this.speedupCanvas = document.getElementById('chartSpeedup');
        this.efficiencyCanvas = document.getElementById('chartEfficiency');
        this.throughputCanvas = document.getElementById('chartThroughput');

        this.initCanvas(this.speedupCanvas);
        this.initCanvas(this.efficiencyCanvas);
        this.initCanvas(this.throughputCanvas);

        // Render initial placeholder charts
        this.renderSpeedupChart([
            { threads: 1, speedup: 1.0 },
            { threads: 2, speedup: 1.25 },
            { threads: 4, speedup: 1.23 },
            { threads: 8, speedup: 0.90 }
        ]);

        this.renderEfficiencyChart([
            { threads: 1, efficiency: 1.0 },
            { threads: 2, efficiency: 0.62 },
            { threads: 4, efficiency: 0.31 },
            { threads: 8, efficiency: 0.11 }
        ]);

        this.renderThroughputChart([
            { threads: 1, gflops: 10.4, bandwidth_gb_s: 14.0 },
            { threads: 2, gflops: 13.0, bandwidth_gb_s: 17.5 },
            { threads: 4, gflops: 12.8, bandwidth_gb_s: 17.2 },
            { threads: 8, gflops: 9.2, bandwidth_gb_s: 12.4 }
        ]);
    }

    initCanvas(canvas) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    // Line Chart: Speedup vs Amdahl
    renderSpeedupChart(data) {
        const canvas = this.speedupCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        ctx.clearRect(0, 0, w, h);

        const padLeft = 32, padBottom = 24, padTop = 14, padRight = 14;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBottom;

        // Draw axes & grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
            const y = padTop + (chartH / 4) * i;
            ctx.moveTo(padLeft, y);
            ctx.lineTo(w - padRight, y);

            ctx.fillStyle = '#64748b';
            ctx.font = '9px monospace';
            const val = (2.0 - (i * 0.5)).toFixed(1) + 'x';
            ctx.fillText(val, 4, y + 3);
        }
        ctx.stroke();

        const maxThreads = data.length > 0 ? data[data.length - 1].threads : 8;
        const getX = (t) => padLeft + ((t - 1) / (maxThreads - 1)) * chartW;
        const getY = (s) => padTop + chartH - (s / 2.0) * chartH;

        // Draw Ideal Linear Speedup (capped at 2x for view or scaled)
        ctx.strokeStyle = '#38bdf8';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        data.forEach((d, idx) => {
            const x = getX(d.threads);
            const y = getY(Math.min(2.0, d.threads));
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Amdahl's Law (Assuming 95% parallel fraction)
        const P = 0.95;
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        data.forEach((d, idx) => {
            const amdahl = 1.0 / ((1 - P) + P / d.threads);
            const x = getX(d.threads);
            const y = getY(amdahl);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw Actual Measured Speedup Curve
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(255, 107, 53, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        data.forEach((d, idx) => {
            const x = getX(d.threads);
            const y = getY(d.speedup);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw Nodes
        data.forEach(d => {
            const x = getX(d.threads);
            const y = getY(d.speedup);

            ctx.fillStyle = '#ff6b35';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // X-axis label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText(d.threads + 'T', x - 6, h - 8);
        });
    }

    // Bar Chart: Parallel Efficiency
    renderEfficiencyChart(data) {
        const canvas = this.efficiencyCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        ctx.clearRect(0, 0, w, h);

        const padLeft = 36, padBottom = 22, padTop = 10, padRight = 14;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBottom;

        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        [1.0, 0.75, 0.5, 0.25, 0.0].forEach(val => {
            const y = padTop + chartH * (1 - val);
            ctx.moveTo(padLeft, y);
            ctx.lineTo(w - padRight, y);
            ctx.fillStyle = '#64748b';
            ctx.font = '9px monospace';
            ctx.fillText(Math.round(val * 100) + '%', 4, y + 3);
        });
        ctx.stroke();

        const barWidth = Math.min(32, (chartW / data.length) * 0.6);
        const slotWidth = chartW / data.length;

        data.forEach((d, i) => {
            const x = padLeft + i * slotWidth + (slotWidth - barWidth) / 2;
            const barHeight = Math.max(2, d.efficiency * chartH);
            const y = padTop + chartH - barHeight;

            // Gradient bar
            const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
            grad.addColorStop(0, '#8b5cf6');
            grad.addColorStop(1, '#6366f1');

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barWidth, barHeight);

            // Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText(d.threads + 'T', x + barWidth / 2 - 6, h - 6);

            // Value label above bar
            ctx.fillStyle = '#c4b5fd';
            ctx.font = '9px monospace';
            ctx.fillText(Math.round(d.efficiency * 100) + '%', x + 2, y - 3);
        });
    }

    // Dual-bar / Line Chart: GFLOPS & Memory Bandwidth
    renderThroughputChart(data) {
        const canvas = this.throughputCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        ctx.clearRect(0, 0, w, h);

        const padLeft = 36, padBottom = 22, padTop = 10, padRight = 14;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBottom;

        // Max scale
        const maxVal = 25.0; // GB/s or GFLOPS

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        [20, 15, 10, 5, 0].forEach(val => {
            const y = padTop + chartH * (1 - val / maxVal);
            ctx.moveTo(padLeft, y);
            ctx.lineTo(w - padRight, y);
            ctx.fillStyle = '#64748b';
            ctx.font = '9px monospace';
            ctx.fillText(val, 10, y + 3);
        });
        ctx.stroke();

        const slotWidth = chartW / data.length;
        const barWidth = 12;

        data.forEach((d, i) => {
            const centerX = padLeft + i * slotWidth + slotWidth / 2;

            // Bar 1: GFLOPS (Cyan)
            const hGflops = (d.gflops / maxVal) * chartH;
            const yGflops = padTop + chartH - hGflops;
            ctx.fillStyle = '#00f0ff';
            ctx.fillRect(centerX - barWidth - 2, yGflops, barWidth, hGflops);

            // Bar 2: Bandwidth GB/s (Green)
            const hBw = (d.bandwidth_gb_s / maxVal) * chartH;
            const yBw = padTop + chartH - hBw;
            ctx.fillStyle = '#10b981';
            ctx.fillRect(centerX + 2, yBw, barWidth, hBw);

            // X label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText(d.threads + 'T', centerX - 6, h - 6);
        });
    }
}

window.ChartManager = ChartManager;
