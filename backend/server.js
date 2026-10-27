const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const SOLVER_BIN = path.join(__dirname, 'heat_solver.exe');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Detect CPU details
function getSystemInfo() {
    const cpus = os.cpus();
    return {
        platform: os.platform(),
        arch: os.arch(),
        cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown CPU',
        logicalCores: cpus.length,
        totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(2),
        freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(2),
        hasBinary: fs.existsSync(SOLVER_BIN)
    };
}

// System info endpoint
app.get('/api/system', (req, res) => {
    res.json(getSystemInfo());
});

// Run C++ OpenMP benchmark
app.post('/api/benchmark', (req, res) => {
    const {
        gridSize = 512,
        steps = 100,
        schedule = 'static',
        chunk = 16,
        alpha = 0.22
    } = req.body;

    if (!fs.existsSync(SOLVER_BIN)) {
        return res.status(500).json({ error: 'heat_solver.exe not found. Please compile it first.' });
    }

    const args = [
        '--grid', String(gridSize),
        '--steps', String(steps),
        '--schedule', String(schedule),
        '--chunk', String(chunk),
        '--alpha', String(alpha),
        '--mode', 'benchmark'
    ];

    execFile(SOLVER_BIN, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Benchmark execution error:', error, stderr);
            return res.status(500).json({ error: error.message, stderr });
        }

        try {
            const data = JSON.parse(stdout);
            res.json(data);
        } catch (parseErr) {
            console.error('Failed to parse C++ JSON output:', stdout);
            res.status(500).json({ error: 'Invalid JSON from C++ solver', raw: stdout });
        }
    });
});

// WebSocket live simulation stream
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    let streamProcess = null;

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            if (msg.type === 'start_stream') {
                if (streamProcess) {
                    streamProcess.kill();
                    streamProcess = null;
                }

                const gridSize = msg.gridSize || 256;
                const steps = msg.steps || 300;
                const threads = msg.threads || 4;
                const schedule = msg.schedule || 'static';
                const alpha = msg.alpha || 0.22;

                if (!fs.existsSync(SOLVER_BIN)) {
                    ws.send(JSON.stringify({ type: 'error', message: 'heat_solver.exe binary not found.' }));
                    return;
                }

                const args = [
                    '--grid', String(gridSize),
                    '--steps', String(steps),
                    '--threads', String(threads),
                    '--schedule', String(schedule),
                    '--alpha', String(alpha),
                    '--mode', 'stream'
                ];

                streamProcess = spawn(SOLVER_BIN, args);
                let buffer = '';

                streamProcess.stdout.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep unfinished line in buffer

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                            if (ws.readyState === ws.OPEN) {
                                ws.send(JSON.stringify({ type: 'frame', payload: JSON.parse(trimmed) }));
                            }
                        }
                    }
                });

                streamProcess.on('close', (code) => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ type: 'stream_ended', code }));
                    }
                    streamProcess = null;
                });

                streamProcess.on('error', (err) => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', message: err.message }));
                    }
                });
            } else if (msg.type === 'stop_stream') {
                if (streamProcess) {
                    streamProcess.kill();
                    streamProcess = null;
                }
                ws.send(JSON.stringify({ type: 'stream_stopped' }));
            }
        } catch (e) {
            console.error('WS message handling error:', e);
        }
    });

    ws.on('close', () => {
        if (streamProcess) {
            streamProcess.kill();
            streamProcess = null;
        }
        console.log('Client disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Thermal Parallel Dashboard running on http://localhost:${PORT}`);
});
