import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

# Paths
BASE_DIR = r"c:\Users\Admin\OneDrive\Desktop\Parallel Computing"
OUTPUT_PPTX = os.path.join(BASE_DIR, "Parallel_Computing_Project_Presentation.pptx")
CHART_DIR = os.path.join(BASE_DIR, "backend", "chart_assets")
os.makedirs(CHART_DIR, exist_ok=True)

SIM_SCREENSHOT = r"C:\Users\Admin\.gemini\antigravity-ide\brain\13acd07a-bae3-4372-a2bf-449b47f8dfba\simulation_loaded_1793032069608.png"
BENCH_SCREENSHOT = r"C:\Users\Admin\.gemini\antigravity-ide\brain\13acd07a-bae3-4372-a2bf-449b47f8dfba\benchmark_results_1793032132482.png"

# Color Palette (Dark HPC Cyber Aesthetic)
BG_COLOR = "#080d16"
CARD_COLOR = "#0c1322"
CYAN = "#00f0ff"
AMBER = "#ff6b35"
GREEN = "#10b981"
PURPLE = "#8b5cf6"
BLUE = "#38bdf8"
GRAY = "#94a3b8"

plt.rcParams.update({
    'figure.facecolor': BG_COLOR,
    'axes.facecolor': CARD_COLOR,
    'axes.edgecolor': '#1e293b',
    'axes.labelcolor': '#f0f4fc',
    'xtick.color': GRAY,
    'ytick.color': GRAY,
    'text.color': '#f0f4fc',
    'grid.color': '#1e293b',
    'grid.linestyle': '--',
    'grid.alpha': 0.6,
    'font.family': 'sans-serif'
})

# 1. Generate Speedup Chart
def generate_speedup_chart():
    threads = np.array([1, 2, 4, 8])
    measured_512 = np.array([1.000, 1.137, 1.201, 0.865])
    measured_1024 = np.array([1.000, 1.072, 0.774, 0.490])
    ideal = threads
    
    # Amdahl's Law with P = 0.90
    P = 0.90
    amdahl = 1.0 / ((1 - P) + P / threads)

    fig, ax = plt.subplots(figsize=(7, 4.2), dpi=200)
    ax.plot(threads, ideal, 'o--', color=BLUE, linewidth=2, label='Ideal Linear (S = p)', alpha=0.8)
    ax.plot(threads, amdahl, 's--', color=GREEN, linewidth=2, label="Amdahl's Law (P = 90%)")
    ax.plot(threads, measured_512, 'o-', color=AMBER, linewidth=3, markersize=8, label='Measured (512×512 Grid)')
    ax.plot(threads, measured_1024, '^-.', color=PURPLE, linewidth=2.5, markersize=8, label='Measured (1024×1024 Grid)')

    ax.set_title("Speedup vs. Amdahl's Law (Intel i5-9300H)", fontsize=13, fontweight='bold', pad=12, color=CYAN)
    ax.set_xlabel("Number of OpenMP Threads", fontsize=11, labelpad=8)
    ax.set_ylabel("Speedup Factor ($S_p$)", fontsize=11, labelpad=8)
    ax.set_xticks(threads)
    ax.set_xticklabels(['1 Core', '2 Cores', '4 Cores', '8 Threads'])
    ax.set_ylim(0, 4.5)
    ax.grid(True)
    ax.legend(frameon=True, facecolor='#111827', edgecolor='#374151', fontsize=9)
    
    # Highlight saturation zone
    ax.axvspan(4, 8, color='#ef4444', alpha=0.12, label='SMT / Bus Contention')
    ax.text(5.5, 3.8, 'Memory Bandwidth Saturation &\nHyper-Threading Contention', 
            color='#fca5a5', fontsize=8, ha='center', bbox=dict(boxstyle='round,pad=0.4', facecolor='#1f2937', edgecolor='#ef4444'))

    plt.tight_layout()
    chart_path = os.path.join(CHART_DIR, "speedup_analysis.png")
    plt.savefig(chart_path)
    plt.close()
    return chart_path

# 2. Generate Parallel Efficiency Chart
def generate_efficiency_chart():
    threads = ['1 Thread', '2 Threads', '4 Threads', '8 Threads']
    eff_512 = [100.0, 56.9, 30.0, 10.8]
    eff_1024 = [100.0, 53.6, 19.3, 6.1]

    x = np.arange(len(threads))
    width = 0.35

    fig, ax = plt.subplots(figsize=(7, 4.2), dpi=200)
    rects1 = ax.bar(x - width/2, eff_512, width, label='512×512 Grid', color=CYAN, edgecolor='#38bdf8', alpha=0.9)
    rects2 = ax.bar(x + width/2, eff_1024, width, label='1024×1024 Grid', color=PURPLE, edgecolor='#a855f7', alpha=0.9)

    ax.set_title("Parallel Efficiency ($E = S_p / p$)", fontsize=13, fontweight='bold', pad=12, color=CYAN)
    ax.set_ylabel("Efficiency (%)", fontsize=11, labelpad=8)
    ax.set_xticks(x)
    ax.set_xticklabels(threads)
    ax.set_ylim(0, 115)
    ax.grid(axis='y')
    ax.legend(frameon=True, facecolor='#111827', edgecolor='#374151', fontsize=9)

    for rect in rects1:
        h = rect.get_height()
        ax.annotate(f'{h:.1f}%', xy=(rect.get_x() + rect.get_width() / 2, h),
                    xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontsize=8, color='#e0f2fe', fontweight='bold')
    for rect in rects2:
        h = rect.get_height()
        ax.annotate(f'{h:.1f}%', xy=(rect.get_x() + rect.get_width() / 2, h),
                    xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontsize=8, color='#f3e8ff', fontweight='bold')

    plt.tight_layout()
    chart_path = os.path.join(CHART_DIR, "efficiency_analysis.png")
    plt.savefig(chart_path)
    plt.close()
    return chart_path

# 3. Generate Roofline & Bandwidth Chart
def generate_roofline_chart():
    threads = ['1T', '2T', '4T', '8T']
    gflops_512 = [10.69, 12.15, 12.83, 9.24]
    bw_512 = [14.36, 16.33, 17.25, 12.42]

    x = np.arange(len(threads))
    width = 0.35

    fig, ax1 = plt.subplots(figsize=(7, 4.2), dpi=200)
    ax2 = ax1.twinx()

    rects1 = ax1.bar(x - width/2, gflops_512, width, label='Throughput (GFLOPS)', color=CYAN, alpha=0.85)
    rects2 = ax2.bar(x + width/2, bw_512, width, label='Bandwidth (GB/s)', color=AMBER, alpha=0.85)

    ax1.set_title("Compute vs. Memory Bandwidth Saturation (Roofline)", fontsize=13, fontweight='bold', pad=12, color=CYAN)
    ax1.set_xlabel("OpenMP Threads", fontsize=11, labelpad=8)
    ax1.set_ylabel("Throughput (GFLOPS)", color=CYAN, fontsize=11, labelpad=8)
    ax2.set_ylabel("Memory Traffic (GB/s)", color=AMBER, fontsize=11, labelpad=8)
    ax1.set_xticks(x)
    ax1.set_xticklabels(threads)
    ax1.set_ylim(0, 18)
    ax2.set_ylim(0, 24)
    ax1.grid(True)

    ax2.axhline(17.5, color='#ef4444', linestyle=':', linewidth=2, label='DDR4 Dual-Channel Saturation Limit (~17.5 GB/s)')
    
    # Combined legend
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', frameon=True, facecolor='#111827', edgecolor='#374151', fontsize=8.5)

    plt.tight_layout()
    chart_path = os.path.join(CHART_DIR, "roofline_analysis.png")
    plt.savefig(chart_path)
    plt.close()
    return chart_path

chart_speedup = generate_speedup_chart()
chart_eff = generate_efficiency_chart()
chart_roofline = generate_roofline_chart()
print("Charts generated successfully!")
