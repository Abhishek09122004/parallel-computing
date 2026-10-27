#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <sstream>
#include <iomanip>
#include <omp.h>

constexpr float DEFAULT_ALPHA = 0.22f;

struct SimulationParams {
    int width = 512;
    int height = 512;
    int steps = 150;
    int num_threads = 4;
    std::string schedule_type = "static";
    int chunk_size = 16;
    float alpha = DEFAULT_ALPHA;
    std::string mode = "benchmark"; // "benchmark", "stream", "interactive"
    bool use_2d_tiling = false;
    int tile_size = 32;
};

struct ThreadMetric {
    int thread_id;
    double compute_time_ms;
    int rows_processed;
};

struct BenchmarkResult {
    int threads;
    std::string schedule;
    int grid_size;
    int steps;
    double total_time_ms;
    double time_per_step_ms;
    double gflops;
    double bandwidth_gb_s;
    double speedup;
    double efficiency;
    std::vector<ThreadMetric> thread_metrics;
};

struct HeatSource {
    int x, y;
    int radius;
    float temp;
};

void initialize_grid(std::vector<float>& u, int width, int height, const std::vector<HeatSource>& sources) {
    std::fill(u.begin(), u.end(), 20.0f); // Ambient 20°C

    if (sources.empty()) {
        // Hotspots (simulating CPU chip multi-core dies + GPU)
        int cx = width / 2;
        int cy = height / 2;
        int r = std::max(6, width / 10);
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                float d1 = std::sqrt(float((x - cx) * (x - cx) + (y - cy) * (y - cy)));
                if (d1 <= r) u[y * width + x] = 100.0f;

                float d2 = std::sqrt(float((x - cx / 2) * (x - cx / 2) + (y - cy / 2) * (y - cy / 2)));
                if (d2 <= r * 0.75f) u[y * width + x] = 85.0f;

                float d3 = std::sqrt(float((x - 3 * cx / 2) * (x - 3 * cx / 2) + (y - 3 * cy / 2) * (y - 3 * cy / 2)));
                if (d3 <= r * 0.75f) u[y * width + x] = 92.0f;
            }
        }
    } else {
        for (const auto& s : sources) {
            for (int y = std::max(0, s.y - s.radius); y < std::min(height, s.y + s.radius + 1); ++y) {
                for (int x = std::max(0, s.x - s.radius); x < std::min(width, s.x + s.radius + 1); ++x) {
                    float dist = std::sqrt(float((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y)));
                    if (dist <= s.radius) {
                        u[y * width + x] = s.temp;
                    }
                }
            }
        }
    }
}

// Optimized persistent parallel region (avoids fork/join overhead per timestep)
BenchmarkResult run_persistent_benchmark(
    int width,
    int height,
    int steps,
    int threads,
    const std::string& schedule_type,
    int chunk_size,
    float alpha,
    double baseline_time_ms = 0.0
) {
    std::vector<float> u1(width * height);
    std::vector<float> u2(width * height);
    std::vector<HeatSource> dummy;
    initialize_grid(u1, width, height, dummy);
    u2 = u1;

    float* current = u1.data();
    float* next = u2.data();

    std::vector<ThreadMetric> thread_metrics(threads);
    for (int t = 0; t < threads; ++t) {
        thread_metrics[t].thread_id = t;
        thread_metrics[t].compute_time_ms = 0.0;
        thread_metrics[t].rows_processed = 0;
    }

    omp_set_num_threads(threads);

    auto start_time = std::chrono::high_resolution_clock::now();

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        int local_rows = 0;
        double thread_t0 = omp_get_wtime();

        for (int step = 0; step < steps; ++step) {
            float* c_ptr = (step % 2 == 0) ? current : next;
            float* n_ptr = (step % 2 == 0) ? next : current;

            if (schedule_type == "dynamic") {
                #pragma omp for schedule(dynamic, chunk_size)
                for (int y = 1; y < height - 1; ++y) {
                    local_rows++;
                    const int y_prev = (y - 1) * width;
                    const int y_curr = y * width;
                    const int y_next = (y + 1) * width;

                    #pragma omp simd
                    for (int x = 1; x < width - 1; ++x) {
                        float laplacian = c_ptr[y_curr + (x + 1)] +
                                          c_ptr[y_curr + (x - 1)] +
                                          c_ptr[y_next + x] +
                                          c_ptr[y_prev + x] -
                                          4.0f * c_ptr[y_curr + x];
                        n_ptr[y_curr + x] = c_ptr[y_curr + x] + alpha * laplacian;
                    }
                }
            } else if (schedule_type == "guided") {
                #pragma omp for schedule(guided, chunk_size)
                for (int y = 1; y < height - 1; ++y) {
                    local_rows++;
                    const int y_prev = (y - 1) * width;
                    const int y_curr = y * width;
                    const int y_next = (y + 1) * width;

                    #pragma omp simd
                    for (int x = 1; x < width - 1; ++x) {
                        float laplacian = c_ptr[y_curr + (x + 1)] +
                                          c_ptr[y_curr + (x - 1)] +
                                          c_ptr[y_next + x] +
                                          c_ptr[y_prev + x] -
                                          4.0f * c_ptr[y_curr + x];
                        n_ptr[y_curr + x] = c_ptr[y_curr + x] + alpha * laplacian;
                    }
                }
            } else { // static
                #pragma omp for schedule(static)
                for (int y = 1; y < height - 1; ++y) {
                    local_rows++;
                    const int y_prev = (y - 1) * width;
                    const int y_curr = y * width;
                    const int y_next = (y + 1) * width;

                    #pragma omp simd
                    for (int x = 1; x < width - 1; ++x) {
                        float laplacian = c_ptr[y_curr + (x + 1)] +
                                          c_ptr[y_curr + (x - 1)] +
                                          c_ptr[y_next + x] +
                                          c_ptr[y_prev + x] -
                                          4.0f * c_ptr[y_curr + x];
                        n_ptr[y_curr + x] = c_ptr[y_curr + x] + alpha * laplacian;
                    }
                }
            }

            // Boundary condition: ambient boundaries
            #pragma omp for schedule(static) nowait
            for (int x = 0; x < width; ++x) {
                n_ptr[x] = 20.0f;
                n_ptr[(height - 1) * width + x] = 20.0f;
            }

            #pragma omp for schedule(static)
            for (int y = 0; y < height; ++y) {
                n_ptr[y * width] = 20.0f;
                n_ptr[y * width + (width - 1)] = 20.0f;
            }
        }

        double thread_t1 = omp_get_wtime();
        thread_metrics[tid].compute_time_ms = (thread_t1 - thread_t0) * 1000.0;
        thread_metrics[tid].rows_processed = local_rows / steps;
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    double total_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();
    double time_per_step_ms = total_ms / steps;

    // 6 FLOPS per interior cell per step
    double total_flops = 6.0 * (width - 2) * (height - 2) * steps;
    double gflops = (total_flops / (total_ms / 1000.0)) / 1e9;

    // Memory traffic: minimum read 5 floats, write 1 float (~24 bytes, or ~8 bytes with optimal caching)
    double total_bytes = 2.0 * sizeof(float) * width * height * steps;
    double bandwidth_gb_s = (total_bytes / (total_ms / 1000.0)) / 1e9;

    double speedup = (baseline_time_ms > 0.0) ? (baseline_time_ms / total_ms) : 1.0;
    double efficiency = speedup / threads;

    return {
        threads,
        schedule_type,
        width,
        steps,
        total_ms,
        time_per_step_ms,
        gflops,
        bandwidth_gb_s,
        speedup,
        efficiency,
        thread_metrics
    };
}

int main(int argc, char* argv[]) {
    SimulationParams params;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--grid" && i + 1 < argc) params.width = params.height = std::stoi(argv[++i]);
        else if (arg == "--steps" && i + 1 < argc) params.steps = std::stoi(argv[++i]);
        else if (arg == "--threads" && i + 1 < argc) params.num_threads = std::stoi(argv[++i]);
        else if (arg == "--schedule" && i + 1 < argc) params.schedule_type = argv[++i];
        else if (arg == "--chunk" && i + 1 < argc) params.chunk_size = std::stoi(argv[++i]);
        else if (arg == "--alpha" && i + 1 < argc) params.alpha = std::stof(argv[++i]);
        else if (arg == "--mode" && i + 1 < argc) params.mode = argv[++i];
    }

    int max_sys_threads = omp_get_max_threads();

    if (params.mode == "benchmark") {
        std::vector<int> thread_counts;
        for (int t = 1; t <= max_sys_threads; t *= 2) {
            thread_counts.push_back(t);
        }
        if (std::find(thread_counts.begin(), thread_counts.end(), max_sys_threads) == thread_counts.end()) {
            thread_counts.push_back(max_sys_threads);
        }

        std::vector<BenchmarkResult> results;
        double baseline_time = 0.0;

        for (int t : thread_counts) {
            BenchmarkResult res = run_persistent_benchmark(
                params.width, params.height, params.steps, t,
                params.schedule_type, params.chunk_size, params.alpha, baseline_time
            );
            if (t == 1) {
                baseline_time = res.total_time_ms;
                res.speedup = 1.0;
                res.efficiency = 1.0;
            }
            results.push_back(res);
        }

        std::cout << "{\n";
        std::cout << "  \"system\": {\n";
        std::cout << "    \"max_threads\": " << max_sys_threads << ",\n";
        std::cout << "    \"compiler\": \"GCC " << __GNUC__ << "." << __GNUC_MINOR__ << "\",\n";
        std::cout << "    \"grid_size\": " << params.width << ",\n";
        std::cout << "    \"steps\": " << params.steps << ",\n";
        std::cout << "    \"schedule\": \"" << params.schedule_type << "\",\n";
        std::cout << "    \"alpha\": " << params.alpha << "\n";
        std::cout << "  },\n";
        std::cout << "  \"results\": [\n";

        for (size_t i = 0; i < results.size(); ++i) {
            const auto& r = results[i];
            std::cout << "    {\n";
            std::cout << "      \"threads\": " << r.threads << ",\n";
            std::cout << "      \"schedule\": \"" << r.schedule << "\",\n";
            std::cout << "      \"total_time_ms\": " << std::fixed << std::setprecision(3) << r.total_time_ms << ",\n";
            std::cout << "      \"time_per_step_ms\": " << std::fixed << std::setprecision(4) << r.time_per_step_ms << ",\n";
            std::cout << "      \"gflops\": " << std::fixed << std::setprecision(3) << r.gflops << ",\n";
            std::cout << "      \"bandwidth_gb_s\": " << std::fixed << std::setprecision(3) << r.bandwidth_gb_s << ",\n";
            std::cout << "      \"speedup\": " << std::fixed << std::setprecision(3) << r.speedup << ",\n";
            std::cout << "      \"efficiency\": " << std::fixed << std::setprecision(3) << r.efficiency << ",\n";
            std::cout << "      \"thread_metrics\": [\n";
            for (size_t j = 0; j < r.thread_metrics.size(); ++j) {
                const auto& tm = r.thread_metrics[j];
                std::cout << "        {\"id\": " << tm.thread_id
                          << ", \"compute_time_ms\": " << std::fixed << std::setprecision(3) << tm.compute_time_ms
                          << ", \"rows\": " << tm.rows_processed << "}"
                          << (j + 1 < r.thread_metrics.size() ? "," : "") << "\n";
            }
            std::cout << "      ]\n";
            std::cout << "    }" << (i + 1 < results.size() ? "," : "") << "\n";
        }
        std::cout << "  ]\n";
        std::cout << "}\n";
    }
    else if (params.mode == "stream") {
        // High-speed stream: continuous frames output to stdout as compact JSON lines
        std::vector<float> u1(params.width * params.height);
        std::vector<float> u2(params.width * params.height);
        std::vector<HeatSource> dummy;
        initialize_grid(u1, params.width, params.height, dummy);
        u2 = u1;

        float* current = u1.data();
        float* next = u2.data();

        int stream_res = std::min(64, params.width);
        int stride = params.width / stream_res;

        omp_set_num_threads(params.num_threads);

        for (int frame = 0; frame < params.steps; ++frame) {
            auto t0 = std::chrono::high_resolution_clock::now();

            #pragma omp parallel for schedule(static)
            for (int y = 1; y < params.height - 1; ++y) {
                const int y_prev = (y - 1) * params.width;
                const int y_curr = y * params.width;
                const int y_next = (y + 1) * params.width;

                #pragma omp simd
                for (int x = 1; x < params.width - 1; ++x) {
                    float laplacian = current[y_curr + (x + 1)] +
                                      current[y_curr + (x - 1)] +
                                      current[y_next + x] +
                                      current[y_prev + x] -
                                      4.0f * current[y_curr + x];
                    next[y_curr + x] = current[y_curr + x] + params.alpha * laplacian;
                }
            }

            // Boundary
            for (int x = 0; x < params.width; ++x) {
                next[x] = 20.0f;
                next[(params.height - 1) * params.width + x] = 20.0f;
            }
            for (int y = 0; y < params.height; ++y) {
                next[y * params.width] = 20.0f;
                next[y * params.width + (params.width - 1)] = 20.0f;
            }

            std::swap(current, next);

            auto t1 = std::chrono::high_resolution_clock::now();
            double step_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

            // Downsampled frame for real-time visualization
            std::cout << "{\"f\":" << frame << ",\"ms\":" << std::fixed << std::setprecision(2) << step_ms << ",\"th\":" << params.num_threads << ",\"d\":[";
            bool first = true;
            for (int sy = 0; sy < stream_res; ++sy) {
                int gy = sy * stride;
                for (int sx = 0; sx < stream_res; ++sx) {
                    int gx = sx * stride;
                    if (!first) std::cout << ",";
                    first = false;
                    std::cout << (int)std::clamp(current[gy * params.width + gx], 0.0f, 255.0f);
                }
            }
            std::cout << "]}\n";
            std::cout.flush();
        }
    }

    return 0;
}
