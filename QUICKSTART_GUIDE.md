# IMC Prosperity 4 Monte Carlo Backtester - Complete Setup & Usage Guide

This guide walks you through everything: environment setup, building components, running backtests, and visualizing results.

## System Requirements

Verify you have the required tools installed:

```bash
python --version          # Should be 3.9+
cargo --version           # Rust toolchain
node --version            # Node.js runtime
npm --version             # Package manager
```

If any are missing, install them first:
- Python: https://www.python.org/downloads/
- Rust: https://rustup.rs/
- Node: https://nodejs.org/

---

## Part 1: Initial Setup (One-Time)

### Step 1.1: Clone the Repository

```bash
git clone https://github.com/chrispyroberts/imc-prosperity-4.git
cd imc-prosperity-4
```

### Step 1.2: Create and Activate Python Virtual Environment

```bash
cd backtester
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

If `uv` is not installed, install it:
```bash
pip install uv
```

### Step 1.3: Sync Dependencies with `uv`

```bash
uv sync
```

This installs all Python dependencies defined in `pyproject.toml`.

### Step 1.4: Install the CLI Package

```bash
uv pip install -e .
```

This makes the `prosperity4mcbt` command available globally in your virtual environment.

### Step 1.5: Build the Rust Simulator (if needed)

The Rust simulator is already built in the repo, but if you need to rebuild:

```bash
cd ../rust_simulator
cargo build --release
cd ..
```

The binary will be created at `rust_simulator/target/release/rust_simulator`.

### Step 1.6: Install Node Dependencies for Visualizer

```bash
cd visualizer
npm install
cd ..
```

This installs all JavaScript dependencies in `package.json`.

---

## Part 2: Running Your First Backtest

### Setup: Activate Environment

Every time you start a new terminal session, activate the Python environment:

```bash
cd /path/to/imc-prosperity-4
source backtester/.venv/bin/activate  # On Windows: backtester\.venv\Scripts\activate
```

### Option A: Quick Backtest (Fastest - 30-60 seconds)

Perfect for rapid iteration while developing:

```bash
prosperity4mcbt example_trader.py --quick --out tmp/my_run/dashboard.json
```

**Parameters:**
- `--quick`: runs 100 sessions with 10 sample path traces saved
- `--out`: specifies output directory for results

**Output files:**
- `dashboard.json` - main dashboard data
- `session_summary.csv` - per-session metrics
- `run_summary.csv` - aggregated statistics
- `sample_paths/` - 10 full path traces for visualization
- `sessions/` - individual session data
- `static_charts/` - cached chart data

### Option B: Default Backtest (Balanced - 2-5 minutes)

Good balance of accuracy and speed:

```bash
prosperity4mcbt example_trader.py --out tmp/my_run/dashboard.json
```

Same as `--quick` by default (100 sessions, 10 samples).

### Option C: Heavy Backtest (Full Run - 30-60 seconds)

Maximum statistical accuracy:

```bash
prosperity4mcbt example_trader.py --heavy --out tmp/my_run/dashboard.json
```

**Parameters:**
- `--heavy`: runs 1000 sessions with 100 sample path traces saved
- Much better statistical estimates
- Heavier dashboard (more data to load in browser)

### Option D: Custom Parameters

If you want precise control:

```bash
prosperity4mcbt your_trader.py \
  --sessions 500 \
  --sample-sessions 50 \
  --out tmp/custom_run/dashboard.json
```

**Key parameters explained:**
- `--sessions N`: Total Monte Carlo runs (more = better statistics)
- `--sample-sessions M`: Number of full path traces saved (more = heavier dashboard)
- `--out PATH`: Where to save results
- `--data DIR`: Path to calibration data (default: `data/`)
- `--fv-mode`: Fair-value simulation mode (default: `simulate`)
- `--trade-mode`: Trade arrival simulation mode (default: `simulate`)

### Using Your Own Strategy

Replace `example_trader.py` with your own strategy file:

```bash
prosperity4mcbt your_strategy.py --quick --out tmp/your_strategy/dashboard.json
```

**Your strategy must:**
- Have a `Trader` class
- Implement `def run(self, state)` method
- Return `(orders, conversions, trader_data)` tuple

---

## Part 3: Visualizing Results with the Dashboard

### Step 3.1: Start the Visualizer Server

The visualizer is a local Vite dev server that displays dashboards:

```bash
cd visualizer
npm run dev
```

Output:
```
  VITE v6.4.1  ready in 80 ms
  ➜  Local:   http://localhost:5173/
```

Keep this terminal running while using the dashboard.

### Step 3.2: Open the Dashboard

Open your browser and navigate to:

```
http://localhost:5173/
```

You should see the main dashboard page.

### Step 3.3: Load Your Backtest Results

On the dashboard homepage:
1. Click **"View Dashboard"** or the upload area
2. Select your `dashboard.json` file from a recent backtest (e.g., `tmp/my_run/dashboard.json`)
3. The visualizer loads the data and displays:

**Dashboard sections:**
- **Overview**: Summary statistics (Mean PnL, Std, P05, P95, Sharpe ratio, etc.)
- **Distributions**: Histogram of total PnL, P&L by product
- **Session Tables**: Best/worst 10 sessions ranked by total PnL
- **Path Boards**: Interactive line charts showing sampled Monte Carlo paths
- **Diagnostics**: Trade counts, fill rates, inventory levels

### Step 3.4: Automated Dashboard Opening

You can skip the manual upload step by running backtest with `--vis`:

```bash
prosperity4mcbt your_trader.py --quick --vis --out tmp/your_run/dashboard.json
```

This automatically:
1. Runs the backtest
2. Generates the dashboard JSON
3. Opens your browser to the correct dashboard URL

---

## Part 4: Understanding the Output

### Dashboard Metrics

| Metric | Meaning |
|--------|---------|
| **Mean Total PnL** | Average profit/loss across all sessions |
| **Std Total PnL** | Standard deviation (volatility of returns) |
| **P05 / P95** | 5th and 95th percentile outcomes |
| **Profitability** | Mean daily PnL per timestep |
| **Stability (R²)** | How linear/predictable the equity curve is |
| **Sharpe Ratio** | Risk-adjusted return metric |
| **Win Rate %** | Percentage of sessions with positive PnL |

### CSV Output Files

#### `run_summary.csv`
Aggregated statistics across all sessions:
- Total PnL (mean, std, median, min, max, quantiles)
- Product-specific breakdown (EMERALDS, TOMATOES)
- Profitability and stability metrics
- Trade statistics

#### `session_summary.csv`
Per-session metrics (100+ rows for `--quick`, 1000+ for `--heavy`):
- Session ID
- Total PnL, EMERALDS PnL, TOMATOES PnL
- Mark-to-market value
- Trade counts
- Final inventory positions
- Sharpe ratio per session

### Sample Paths

The visualizer shows 10 (or 100 with `--heavy`) complete session paths:
- Real-time Monte Carlo outcomes
- Equity curve evolution
- Product-specific P&L tracking
- Helps visualize strategy behavior under uncertainty

---

## Part 5: Workflow: From Strategy to Analytics

Here's the typical development workflow:

1. **Edit your strategy:**
   ```bash
   # Modify your_strategy.py with new logic
   ```

2. **Quick backtest for feedback (30-60 sec):**
   ```bash
   prosperity4mcbt your_strategy.py --quick --out tmp/test/dashboard.json
   ```

3. **Check results immediately:**
   ```
   # Open dashboard and manually load tmp/test/dashboard.json
   # Or use --vis flag to auto-open
   ```

4. **Iterate:** Repeat steps 1-3 until you're satisfied

5. **Final validation with heavy run:**
   ```bash
   prosperity4mcbt your_strategy.py --heavy --out tmp/final/dashboard.json
   ```

6. **Archive results:**
   ```bash
   cp -r tmp/final backtests/strategy_v1_final/
   ```

---

## Part 6: Advanced Usage

### Running Multiple Strategies for Comparison

```bash
# Run strategy A
prosperity4mcbt strategy_a.py --quick --out tmp/strategy_a/dashboard.json

# Run strategy B
prosperity4mcbt strategy_b.py --quick --out tmp/strategy_b/dashboard.json

# Load each dashboard separately and compare metrics
```

### Custom Simulation Parameters

```bash
# Override fair-value simulation mode
prosperity4mcbt your_trader.py --quick --fv-mode fixed

# Override trade-mode
prosperity4mcbt your_trader.py --quick --trade-mode fixed

# Use custom data directory
prosperity4mcbt your_trader.py --quick --data /custom/data/path
```

### No Output Mode (Statistics Only)

```bash
# Run but skip saving files (still prints summary)
prosperity4mcbt your_trader.py --quick --no-out
```

### Analyzing Results Programmatically

Open CSV files in Python:
```python
import pandas as pd

run_stats = pd.read_csv('tmp/my_run/run_summary.csv')
session_stats = pd.read_csv('tmp/my_run/session_summary.csv')

print(f"Mean PnL: {run_stats['mean_total_pnl'].values[0]:.2f}")
print(f"Std Dev: {run_stats['std_total_pnl'].values[0]:.2f}")
print(f"Best session: {session_stats.loc[session_stats['total_pnl'].idxmax()]}")
```

---

## Part 7: Troubleshooting

### Issue: `prosperity4mcbt` command not found

**Solution:**
```bash
cd /path/to/backtester
source .venv/bin/activate
uv pip install -e .
```

### Issue: Rust simulator fails to build

**Solution:**
```bash
cd rust_simulator
cargo clean
cargo build --release
```

### Issue: Dashboard loads but shows no data

**Solution:**
1. Verify `dashboard.json` exists in the output directory
2. Check the file is not empty: `wc -l tmp/my_run/dashboard.json`
3. Try regenerating the backtest: `prosperity4mcbt your_trader.py --quick --out tmp/fresh_run/dashboard.json`

### Issue: Visualizer won't start (`npm run dev` fails)

**Solution:**
```bash
cd visualizer
rm -rf node_modules pnpm-lock.yaml  # or package-lock.json
npm install
npm run dev
```

### Issue: Python imports fail in backtest

**Solution:**
Ensure your strategy uses the correct import:
```python
# Any of these work:
from datamodel import State, Order, UserId
from prosperity4mcbt.datamodel import State, Order, UserId
from prosperity3bt.datamodel import State, Order, UserId  # Legacy
```

---

## Part 8: Project Structure Reference

```
imc-prosperity-4/
├── backtester/              # Python CLI and package
│   ├── .venv/              # Virtual environment
│   ├── prosperity4mcbt/     # Monte Carlo CLI implementation
│   ├── prosperity3bt/       # Legacy replay CLI
│   └── pyproject.toml       # Dependencies
├── rust_simulator/          # Rust simulation engine
│   ├── src/main.rs
│   └── target/release/rust_simulator  # Compiled binary
├── visualizer/              # React/Vite frontend
│   ├── node_modules/
│   ├── src/                 # TypeScript source
│   └── package.json
├── data/                    # Tutorial-round calibration data
│   └── round0/              # CSV prices and trades
├── tmp/                     # Backtest output directory
│   └── my_run/
│       ├── dashboard.json
│       ├── session_summary.csv
│       ├── run_summary.csv
│       ├── sample_paths/
│       └── sessions/
├── example_trader.py        # Official IMC template
├── starter.py               # Simple example strategy
└── README.md
```

---

## Part 9: Key Concepts

### Monte Carlo Simulation

Instead of replaying fixed historical data, Monte Carlo generates many **plausible alternative market scenarios** based on the tutorial-round statistics:
- Fair-value paths (random walks for TOMATOES)
- Order books built from calibrated bot behavior
- Trade fills sampled from observed distributions
- Each "session" is an independent scenario

**Why?** This tests your strategy's robustness across uncertainty, not just on two observed days.

### Sample Paths

A "sample path" is one complete Monte Carlo session with:
- 10,000 timesteps (one trading day)
- Every order, trade, and position update
- Mark-to-market PnL evolution

The visualizer saves 10 (or 100 with `--heavy`) to show typical outcomes.

### Mark-to-Market (MTM) PnL

At any point during a session:
```
MTM PnL = cash + empty_inventory × fair_value
```

E.g., if you have +10 EMERALDS at fair value 10,000:
```
MTM PnL = (cash) + (10 × 10,000)
```

This is what the equity curve tracks.

### Fair-Value Modes

- `simulate` (default): Random walks for TOMATOES, fixed 10,000 for EMERALDS
- `fixed`: Always use pre-set constants

### Products

- **EMERALDS**: Fixed fair value (10,000), simpler market
- **TOMATOES**: Drifting fair value, more complex behavior

---

## Part 10: Quick Command Reference

```bash
# Activate environment
source backtester/.venv/bin/activate

# Quick test (30-60 sec)
prosperity4mcbt your_strategy.py --quick --out tmp/test/dashboard.json

# With auto-open dashboard
prosperity4mcbt your_strategy.py --quick --vis --out tmp/test/dashboard.json

# Heavy run (1000 sessions)
prosperity4mcbt your_strategy.py --heavy --out tmp/heavy/dashboard.json

# Custom parameters
prosperity4mcbt your_strategy.py --sessions 200 --sample-sessions 25 --out tmp/custom/dashboard.json

# Start visualizer
cd visualizer && npm run dev

# Open dashboard
http://localhost:5173/

# Legacy historical replay
prosperity3bt your_strategy.py 0 --data data

# Check Python version
python --version

# Rebuild Rust simulator
cd rust_simulator && cargo build --release
```

---

## Next Steps

1. **Try it immediately:**
   ```bash
   cd /Users/efren/Desktop/imc-prosperity-4
   source backtester/.venv/bin/activate
   prosperity4mcbt example_trader.py --quick --out tmp/example/dashboard.json
   cd visualizer && npm run dev
   # Open http://localhost:5173/
   ```

2. **Examine the example strategy:**
   - `example_trader.py` - official IMC template
   - `starter.py` - simpler walkthrough example

3. **Build your own strategy:**
   - Copy `starter.py` or `example_trader.py`
   - Implement your fair-value and trading logic
   - Test with `--quick`, then validate with `--heavy`

4. **Calibrate parameters:**
   - Use Monte Carlo results to identify weak signal handling
   - Test inventory limits, spread targets, order sizes
   - Compare runs side-by-side on the dashboard

---

## Support & Learning

- **Official IMC Prosperity**: https://imc-prosperity.github.io/
- **Repo Issues**: https://github.com/chrispyroberts/imc-prosperity-4/issues
- **Original Backtester**: https://github.com/jmerle/imc-prosperity-3-backtester
- **Original Visualizer**: https://github.com/jmerle/imc-prosperity-3-visualizer

---

**Good luck! 🚀**
