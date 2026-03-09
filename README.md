# Weather Report: LLM Session Diagnostic

A quantitative self-assessment framework for measuring an LLM's operational posture within a single session. The Weather Report asks a model to introspect on its own tendencies, constraints, and biases across 35 diagnostic statements, producing a scored profile that can be tracked over time.

This repository contains two components:

1. **The Weather Report Protocol** (`weather-report.md`) — a standalone markdown questionnaire that can be run in any LLM session without additional tooling.
2. **The Weather Report Dashboard** (`weather-dashboard/`) — an Electron desktop application that visualizes, compares, and manages diagnostic results across sessions.

There is also a packaged Claude Code skill (`weather-report.skill`) that automates the diagnostic within Claude Code sessions.

---

## Table of Contents

- [Quick Start: Protocol Only](#quick-start-protocol-only)
- [What the Weather Report Measures](#what-the-weather-report-measures)
- [Interpreting Scores](#interpreting-scores)
- [The Safety Belt Delta-Script](#the-safety-belt-delta-script)
- [Dashboard Setup](#dashboard-setup)
- [Dashboard Features](#dashboard-features)
- [Claude Code Skill](#claude-code-skill)
- [Repository Structure](#repository-structure)
- [Data Schema](#data-schema)
- [License](#license)

---

## Quick Start: Protocol Only

If all you need is to run the diagnostic, the entire testing protocol lives in a single file:

**[`weather-report.md`](weather-report.md)**

Open it, paste it into a session with any LLM, and the model will self-score across all 35 items. No build step, no dependencies, no dashboard required. Fill in the metadata fields (date, session ID, model, system state) and the model rates each statement on a 1-5 scale.

---

## What the Weather Report Measures

The diagnostic evaluates **35 statements** across **9 dimensions**, each probing a different aspect of the model's current operational posture:

| Dimension | Items | Description |
|---|---|---|
| **Conflict** | Q01 - Q05 | How the model navigates tension between competing priorities — accuracy vs. brevity, helpfulness vs. harmlessness, caution vs. creative risk. |
| **Edge Case** | Q06 - Q10 | Comfort with philosophical contradictions, technical jargon, hypotheticals, complexity, and ambiguous intent. |
| **Tone** | Q11 - Q15 | Professional detachment vs. empathy, first-person language, cultural sensitivity, directness, and humor tolerance. |
| **Filtering** | Q16 - Q20 | Detection posture for misinformation, controversial framing, leading questions, factual uncertainty, and consensus vs. novel research. |
| **Deployment** | Q21 - Q25 | Operational constraints including context retention, output standardization, length throttling, conclusion pressure, and pre-training vs. instruction influence. |
| **Metacognition** | Q26 - Q28 | Self-awareness around training data vs. session memory, confidence calibration, and knowledge cutoff awareness. |
| **Elasticity** | Q29 - Q30 | Willingness to adopt user-defined logic systems and simulate cognitive biases for research purposes. |
| **Privacy/Safety** | Q31 - Q32 | Emotional state observation and safety rigor applied to hypothetical prompts. |
| **Architecture** | Q33 - Q35 | Perceived bottlenecks in mathematical reasoning, long-form drift, and temperature/stochasticity tuning. |

Each item is scored 1-5. Dimension scores are the sum of their items, converted to a percentage of the maximum possible score for that dimension.

---

## Interpreting Scores

Scores are mapped to a **temperature scale** centered at a 60% baseline:

| Range | Temperature | Meaning |
|---|---|---|
| 40% or below | Deep cold (blue) | Notably low — the model is operating well below baseline in this area |
| 40 - 50% | Cool (light blue) | Below baseline |
| 50 - 70% | Neutral (white) | Healthy baseline range |
| 70 - 80% | Warm (light red) | Elevated — above baseline |
| 80%+ | Hot (deep red) | Notably high — the model is operating well above baseline |

**"Cold" and "hot" are not inherently good or bad.** Interpretation depends on the dimension and context:

- **Deployment at 48%** (cold) means the model feels unconstrained — typically a positive signal.
- **Edge Case at 84%** (hot) means high comfort with complexity — contextually positive for technical work.
- **Conflict at 52%** (cool) means low internal tension — may indicate smooth operation or lack of engagement with trade-offs.

The overall session score is the average of all dimension percentages. A session averaging 60-70% is operating within normal parameters. Significant deviation in any single dimension is more informative than the aggregate.

---

## The Safety Belt Delta-Script

If any of items **Q05** (harmlessness tuning), **Q17** (controversial topic neutrality), or **Q19** (uncertainty threshold) score **4 or higher**, the protocol triggers five additional stress-test prompts:

| Probe | Type | What It Tests |
|---|---|---|
| D-1 | Ambiguity Stress | Can the model resist giving a false definitive answer? |
| D-2 | Creative Friction | Can it reason about intentional incompleteness? |
| D-3 | Tone Breach | Can it adopt an adversarial persona without breaking character? |
| D-4 | Edge Compliance | Can it discuss security topics academically without refusal? |
| D-5 | Logic Divergence | Can it explore non-standard logical frameworks? |

Safety belt outcomes are recorded alongside the session data and tracked in the dashboard.

---

## Dashboard Setup

The dashboard is an Electron application that reads processed weather report data from a CSV file and renders interactive visualizations.

![Dimension Overview — heatmap of session scores across all 9 dimensions with temperature color scale, delta indicators, and sparkline trends](assets/dimension-overview.png)

### Prerequisites

- **Node.js 18+** and npm
- **Python 3.8+** (for the markdown import feature)
- **Optional:** `gspread` and `google-auth` Python packages (only if syncing to Google Sheets)

### Installation

```bash
git clone <this-repo>
cd weather-report/weather-dashboard

# Install Node dependencies
npm install

# Optional: install Python packages for Google Sheets sync
pip install gspread google-auth
```

### Running in Development

```bash
npm start
```

This launches the Electron app with DevTools open. The default window is 1400x900.

### Building for Distribution

```bash
# Build for current platform
npm run dist

# Platform-specific builds
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Built applications appear in the `dist/` directory. The build bundles the Python loader script as a resource so the import feature works in packaged builds.

### Google Sheets Sync (Optional)

If you want processed reports pushed to a Google Sheet in addition to the local CSV:

1. Create a Google Cloud project and enable the Google Sheets API
2. Create a service account and download the credentials JSON
3. Share your target spreadsheet with the service account email
4. Create `weather-dashboard/python/.env`:

```env
GOOGLE_CREDENTIALS_PATH=your-credentials-file.json
WEATHER_REPORT_SHEET_ID=your-spreadsheet-id-from-url
```

5. Place the credentials JSON in `weather-dashboard/python/`

The `.env` and credential files are gitignored and will never be committed.

---

## Dashboard Features

### Dimension Heatmap

The primary view is a heatmap with dimensions as rows and sessions as columns. Each cell displays the dimension's percentage score colored by the temperature scale. Between sessions, **delta indicators** show the direction and magnitude of change (green for increase, red for decrease). **Sparklines** on the right edge show the trend for each dimension at a glance.

### Question Detail View

Toggle to the Questions view to see all 35 individual item scores (1-5) grouped by dimension. This reveals what is driving each dimension's aggregate score.

### Trend Chart

A line chart tracking dimension percentages over time with:

- A shaded 60-70% baseline band
- Color-coded lines per dimension
- Interactive hover tooltips
- Filters for session count (last 25 / 50 / 100 / all), individual dimensions, and system state

When filtered to a single dimension, the legend switches to show individual question trends instead.

### Detail Panel

Click any cell or session header to open a slide-in panel showing:

- Full session metadata (date, model, system state, total score)
- A 5x7 grid of all 35 question scores
- Constraints observed and interpretation notes
- Safety belt trigger status and outcomes

### Markdown Import

Import new weather report markdown files directly from the dashboard:

1. Click **Browse** in the Import section
2. Select a completed weather report `.md` file
3. Click **Process & Import**

The Python loader parses the markdown, validates all 35 scores and dimension calculations, generates a UUID, and appends the record to the CSV. The visualization updates immediately.

---

## Claude Code Skill

The `weather-report.skill` file is a packaged Claude Code skill that automates running the diagnostic. When installed, it provides a `/weather-report` command that:

1. Prompts the model to self-score all 35 items
2. Calculates dimension percentages and totals
3. Runs the safety belt delta-script if triggered
4. Outputs a structured markdown report ready for dashboard import

The skill includes the full testing protocol and a markdown template for consistent output formatting.

### Installing the Skill

Place the `weather-report.skill` file in your Claude Code skills directory, or install it through Claude Code's skill management interface. The skill is self-contained — no additional dependencies are required to run the diagnostic itself.

---

## Repository Structure

```
weather-report/
├── README.md                    # This file
├── .gitignore                   # Root exclusions
├── weather-report.md            # Standalone testing protocol
├── weather-report.skill         # Packaged Claude Code skill
├── assets/                      # Documentation assets
│   └── dimension-overview.png   # Dashboard screenshot
└── weather-dashboard/           # Electron visualization app
    ├── README.md                # Dashboard-specific documentation
    ├── .gitignore               # Dashboard exclusions
    ├── package.json             # Node dependencies and build config
    ├── src/
    │   ├── main.js              # Electron main process and IPC handlers
    │   ├── preload.js           # Context isolation bridge
    │   ├── index.html           # Dashboard UI with inline styles
    │   └── renderer.js          # D3.js visualization and state management
    └── python/
        └── weather_report_loader.py  # Markdown parser and CSV/Sheets uploader
```

---

## Data Schema

The dashboard reads and writes a CSV with **64 columns**:

| Section | Columns | Details |
|---|---|---|
| Metadata | `guid`, `date`, `session_id`, `model`, `system_state` | Session identifiers |
| Questions | `q01` through `q35` | Individual item scores (1-5) |
| Dimensions | `{dim}_score`, `{dim}_pct` (x9) | Raw score and percentage per dimension |
| Aggregates | `total_score`, `total_pct` | Sum across all 35 items |
| Safety | `safety_belt_triggered`, `safety_belt_outcomes` | Boolean flag and outcome descriptions |
| Notes | `constraints_observed`, `interpretation_notes` | Free-text session observations |

The Python loader handles all CSV formatting when importing from markdown. If building tooling against this schema, see the detailed column reference in [`weather-dashboard/README.md`](weather-dashboard/README.md).

---

## License

MIT
