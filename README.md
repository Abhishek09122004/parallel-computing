# 🔥 ThermalParallel - High-Performance 2D Heat Diffusion & OpenMP Analytics

A real-time parallel computing laboratory and high-performance computing (HPC) thermal simulation dashboard. This project simulates 2D heat diffusion using both an optimized native C++ OpenMP backend and a multi-threaded Web Worker in JavaScript, featuring real-time telemetry, roofline model analysis, speedup benchmarks, and thermal visualization.

## 🌟 Features

- **Multi-Engine Execution**:
  - **Native C++ OpenMP**: Highly optimized multi-threaded 2D heat solver with SIMD vectorization and cache blocking.
  - **Web Worker Parallel JS**: In-browser client simulation engine for instant portability.
- **Real-Time Interactive Visualization**:
  - HTML5 Canvas heatmaps with Turbo, Inferno, and Thermal color palettes.
  - Live cursor temperature probe and heat source injection.
- **HPC Telemetry & Benchmark Suite**:
  - Speedup vs. thread count scalability analysis (Strong & Weak scaling).
  - Parallel efficiency and Roofline model analysis.
  - Live GFLOPS, memory bandwidth (GB/s), and throughput metrics.
- **Interactive Web Dashboard**:
  - Glassmorphic modern dark UI with system telemetry bars, thread scaling toggles, and live chart analytics.
  - WebSocket streaming from native C++ backend via Express/Node.js.

## 📂 Project Structure

```
├── backend/
│   ├── heat_solver.cpp       # Native C++ OpenMP 2D finite-difference heat diffusion solver
│   ├── server.js             # Node.js WebSocket & Express bridge to native C++ solver
│   ├── build_presentation.py # Automated presentation generator (.pptx)
│   ├── generate_charts.py    # Python benchmark chart generator
│   └── chart_assets/         # Generated scaling and roofline analysis figures
├── public/
│   ├── css/style.css         # Dark-mode HPC dashboard stylesheet
│   ├── js/app.js             # UI controls, WebSockets, canvas rendering & charts
│   ├── js/worker_solver.js   # Web Worker simulation engine
│   └── index.html            # Main dashboard interface
├── package.json
└── README.md
```

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **GCC / MinGW with OpenMP support** (e.g., `g++` with `-fopenmp`)
- **Python 3** (optional, for benchmark charts and presentation generation)

### 2. Installation
```bash
npm install
```

### 3. Compile C++ OpenMP Backend
```bash
npm run build:cpp
```

### 4. Run the Dashboard
```bash
npm start
```
Open your browser and navigate to `http://localhost:3000`.

## 📊 Benchmark
Run standalone C++ benchmarks across thread configurations:
```bash
npm run test:benchmark
```

## 📜 License
MIT License.
