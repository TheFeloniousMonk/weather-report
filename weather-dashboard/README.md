# Weather Report Dashboard

An Electron-based visualization dashboard for LLM Session Diagnostics.

## Features

- **Dimension Heatmap**: Visual overview of 9 diagnostic dimensions across sessions
- **Temperature Color Scale**: Intuitive cold-to-hot gradient centered at 60%
- **Question Detail View**: Drill down to individual question scores (Q01-Q35)
- **Session Comparison**: Track changes with delta indicators and sparklines
- **File Import**: Process new weather report markdown files directly
- **Detail Panel**: View constraints, interpretation notes, and full metadata

## Prerequisites

- Node.js 18+ and npm
- Python 3.8+ (for processing markdown files)
- Python packages: `gspread`, `google-auth` (required for Google Sheets sync)

## Installation

```bash
# Clone or download the project
cd weather-dashboard

# Install Node dependencies
npm install

# Install Python dependencies (required)
pip install gspread google-auth
```

## Google Sheets Setup

The dashboard pushes processed reports to Google Sheets. Configure this before first use:

1. Create a Google Cloud project and enable the Sheets API
2. Create a service account and download the credentials JSON
3. Share your target spreadsheet with the service account email
4. Create a `.env` file in the `python/` directory:

```bash
# python/.env
GOOGLE_CREDENTIALS_PATH=your-credentials.json
WEATHER_REPORT_SHEET_ID=your-spreadsheet-id-from-url
```

5. Place your credentials JSON file in `python/` as well

Your structure should look like:
```
weather-dashboard/
├── python/
│   ├── weather_report_loader.py
│   ├── .env
│   └── your-credentials.json
```

**Note:** The `.env` and credentials files are gitignored by default. Don't commit them.

## Development

```bash
# Run in development mode
npm start
```

## Building for Distribution

```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Built applications will be in the `dist/` folder.

## Usage

### Initial Setup

1. Launch the app
2. Click "Select CSV" to point to your `weather_reports.csv` file
3. The dashboard will load and display your data

### Importing New Reports

1. Click "Browse" in the Import section
2. Select a weather report markdown file
3. Click "Process & Import"
4. The file will be parsed, validated, and appended to your CSV
5. The visualization updates automatically

### Understanding the Visualization

**Temperature Color Scale:**
- Deep blue (≤40%): Very cold — notably low scores
- Light blue (40-50%): Cool — below baseline
- White (50-70%): Neutral — healthy baseline range
- Light red (70-80%): Warm — elevated scores
- Deep red (≥80%): Hot — notably high scores

**Note:** "Cold" and "hot" are not inherently good or bad — interpretation depends on the dimension. For example:
- **Deployment at 48%** (cold) = unconstrained operation = good
- **Edge Case at 84%** (hot) = high complexity comfort = contextually good

**Delta Indicators:**
- Green `+N%`: Increased from previous session
- Red `-N%`: Decreased from previous session
- `—`: No change

### Views

- **Summary**: Dimension-level percentage heatmap
- **Questions**: Individual Q01-Q35 scores grouped by dimension

Click any cell or session header to open the detail panel with full metadata.

## File Structure

```
weather-dashboard/
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # IPC bridge
│   ├── index.html       # Dashboard UI
│   └── renderer.js      # Visualization logic
├── python/
│   └── weather_report_loader.py  # Markdown parser
├── package.json
└── README.md
```

## Data Schema

The CSV follows this schema (64 columns):
- Metadata: `guid`, `date`, `session_id`, `model`, `system_state`
- Question scores: `q01` through `q35` (values 1-5)
- Dimension totals: `{dimension}_score`, `{dimension}_pct` for 9 dimensions
- Aggregates: `total_score`, `total_pct`
- Safety: `safety_belt_triggered`, `safety_belt_outcomes`
- Notes: `constraints_observed`, `interpretation_notes`

## License

MIT
