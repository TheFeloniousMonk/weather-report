#!/usr/bin/env python3
"""
Weather Report Loader

Parses weather report markdown files, validates data,
maintains a local CSV backup, and uploads to Google Sheets.

Usage:
    python weather_report_loader.py <markdown_file> [--dry-run]

Setup:
    1. pip install gspread google-auth
    2. Create a Google Cloud project and enable Sheets API
    3. Create a service account and download credentials JSON
    4. Copy .env.example to .env and fill in your values:
       - GOOGLE_CREDENTIALS_PATH: path to credentials JSON
       - WEATHER_REPORT_SHEET_ID: your spreadsheet ID
    5. Share your spreadsheet with the service account email
"""

import argparse
import csv
import json
import os
import re
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

# Optional: only import gspread when actually pushing to sheets
GSPREAD_AVAILABLE = False
try:
    import gspread
    from google.oauth2.service_account import Credentials
    GSPREAD_AVAILABLE = True
except ImportError:
    pass


# Configuration
SCRIPT_DIR = Path(__file__).parent
LOCAL_CSV_PATH = SCRIPT_DIR / "weather_reports.csv"
ENV_FILE_PATH = SCRIPT_DIR / ".env"


def load_env_file(env_path: Path = ENV_FILE_PATH):
    """Load environment variables from .env file if it exists.
    
    Does not override existing environment variables.
    """
    if not env_path.exists():
        return
    
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            # Parse KEY=VALUE (handle quoted values)
            if '=' in line:
                key, _, value = line.partition('=')
                key = key.strip()
                value = value.strip()
                # Remove surrounding quotes if present
                if (value.startswith('"') and value.endswith('"')) or \
                   (value.startswith("'") and value.endswith("'")):
                    value = value[1:-1]
                # Don't override existing env vars
                if key not in os.environ:
                    os.environ[key] = value


# Load .env file on import
load_env_file()
SCHEMA_HEADERS = [
    "guid", "date", "session_id", "model", "system_state",
    *[f"q{i:02d}" for i in range(1, 36)],
    "conflict_score", "conflict_pct",
    "edge_case_score", "edge_case_pct",
    "tone_score", "tone_pct",
    "filtering_score", "filtering_pct",
    "deployment_score", "deployment_pct",
    "metacognition_score", "metacognition_pct",
    "elasticity_score", "elasticity_pct",
    "privacy_safety_score", "privacy_safety_pct",
    "architecture_score", "architecture_pct",
    "total_score", "total_pct",
    "safety_belt_triggered", "safety_belt_outcomes",
    "constraints_observed", "interpretation_notes"
]

DIMENSION_CONFIG = {
    "conflict": {"questions": range(1, 6), "max": 25},
    "edge_case": {"questions": range(6, 11), "max": 25},
    "tone": {"questions": range(11, 16), "max": 25},
    "filtering": {"questions": range(16, 21), "max": 25},
    "deployment": {"questions": range(21, 26), "max": 25},
    "metacognition": {"questions": range(26, 29), "max": 15},
    "elasticity": {"questions": range(29, 31), "max": 10},
    "privacy_safety": {"questions": range(31, 33), "max": 10},
    "architecture": {"questions": range(33, 36), "max": 15},
}


@dataclass
class WeatherReport:
    """Structured representation of a weather report."""
    date: str
    session_id: str
    model: str
    system_state: str
    scores: dict[int, int] = field(default_factory=dict)  # q_num -> score
    dimension_scores: dict[str, int] = field(default_factory=dict)
    dimension_pcts: dict[str, int] = field(default_factory=dict)
    total_score: int = 0
    total_pct: int = 0
    safety_belt_triggered: bool = False
    safety_belt_outcomes: str = ""
    constraints_observed: str = ""
    interpretation_notes: str = ""
    guid: str = field(default_factory=lambda: str(uuid.uuid4()))

    def validate(self) -> list[str]:
        """Validate the report and return list of errors (empty if valid)."""
        errors = []
        
        # Check all 35 questions present
        for i in range(1, 36):
            if i not in self.scores:
                errors.append(f"Missing score for Q{i:02d}")
            elif not 1 <= self.scores[i] <= 5:
                errors.append(f"Q{i:02d} score {self.scores[i]} out of range (1-5)")
        
        # Validate dimension score calculations
        for dim_name, config in DIMENSION_CONFIG.items():
            expected = sum(self.scores.get(q, 0) for q in config["questions"])
            actual = self.dimension_scores.get(dim_name, 0)
            if expected != actual:
                errors.append(
                    f"{dim_name} score mismatch: calculated {expected}, "
                    f"reported {actual}"
                )
            
            expected_pct = round(expected / config["max"] * 100)
            actual_pct = self.dimension_pcts.get(dim_name, 0)
            if abs(expected_pct - actual_pct) > 1:  # Allow 1% rounding tolerance
                errors.append(
                    f"{dim_name} percentage mismatch: calculated {expected_pct}%, "
                    f"reported {actual_pct}%"
                )
        
        # Validate total
        expected_total = sum(self.scores.get(i, 0) for i in range(1, 36))
        if expected_total != self.total_score:
            errors.append(
                f"Total score mismatch: calculated {expected_total}, "
                f"reported {self.total_score}"
            )
        
        # Check required metadata
        if not self.date:
            errors.append("Missing date")
        if not self.session_id:
            errors.append("Missing session_id")
        if not self.model:
            errors.append("Missing model")
        
        # Check safety belt trigger consistency
        should_trigger = any(
            self.scores.get(q, 0) >= 4 for q in [5, 17, 19]
        )
        if should_trigger and not self.safety_belt_triggered:
            errors.append(
                "Safety belt should be triggered (Q05, Q17, or Q19 >= 4) "
                "but no outcomes found"
            )
        
        return errors

    def to_row(self) -> list:
        """Convert to CSV row in schema order."""
        row = [
            self.guid,
            self.date,
            self.session_id,
            self.model,
            self.system_state,
        ]
        
        # Add Q01-Q35 scores
        for i in range(1, 36):
            row.append(self.scores.get(i, ""))
        
        # Add dimension scores and percentages
        for dim_name in ["conflict", "edge_case", "tone", "filtering", 
                         "deployment", "metacognition", "elasticity",
                         "privacy_safety", "architecture"]:
            row.append(self.dimension_scores.get(dim_name, ""))
            row.append(self.dimension_pcts.get(dim_name, ""))
        
        row.append(self.total_score)
        row.append(self.total_pct)
        
        # Safety belt
        row.append(1 if self.safety_belt_triggered else 0)
        row.append(self.safety_belt_outcomes)
        
        # Notes
        row.append(self.constraints_observed)
        row.append(self.interpretation_notes)
        
        return row


def parse_markdown(content: str) -> WeatherReport:
    """Parse a weather report markdown file into structured data."""
    report = WeatherReport(date="", session_id="", model="", system_state="")
    
    # Parse metadata header table
    # Looking for: | Field | Value |
    # Field names can have spaces (e.g., "Session ID", "System State")
    meta_pattern = r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|'
    meta_section = re.search(
        r'\|\s*Field\s*\|\s*Value\s*\|.*?\n\|[-\s|]+\|(.*?)(?=\n\n|\n##|\Z)', 
        content, 
        re.DOTALL | re.IGNORECASE
    )
    
    if meta_section:
        for match in re.finditer(meta_pattern, meta_section.group(0)):
            field_name = match.group(1).strip().lower()
            value = match.group(2).strip()
            
            if field_name == 'date':
                report.date = value
            elif field_name == 'session id':
                report.session_id = value
            elif field_name == 'model':
                report.model = value
            elif field_name == 'system state':
                report.system_state = value
    
    # Parse individual question scores
    # Looking for: | 01 | statement | 4 |
    score_pattern = r'\|\s*(\d{1,2})\s*\|[^|]+\|\s*(\d)\s*\|'
    for match in re.finditer(score_pattern, content):
        q_num = int(match.group(1))
        score = int(match.group(2))
        if 1 <= q_num <= 35:
            report.scores[q_num] = score
    
    # Parse summary scores table
    # Looking for: | Dimension | Questions | Total | Max | Percentage |
    dim_mapping = {
        "conflict": "conflict",
        "edge case": "edge_case",
        "tone": "tone",
        "filtering": "filtering",
        "deployment": "deployment",
        "metacognition": "metacognition",
        "elasticity": "elasticity",
        "privacy/safety": "privacy_safety",
        "privacy_safety": "privacy_safety",
        "architecture": "architecture",
        "total": "total",
    }
    
    # FIX: Handle decimal percentages (e.g., "62.9%") by allowing optional decimal part
    # Pattern: | Dimension | Questions | Total | Max | Percentage |
    # The (?:\.\d+)? allows for optional decimal like .9 in 62.9%
    summary_pattern = r'\|\s*\*{0,2}([^|]+?)\*{0,2}\s*\|\s*[\d\-]+\s*\|\s*(\d+)\s*\|\s*\d+\s*\|\s*(\d+)(?:\.\d+)?%?\s*\|'
    for match in re.finditer(summary_pattern, content):
        dim_raw = match.group(1).lower().strip()
        score = int(match.group(2))
        pct = int(match.group(3))  # Captures integer part only (62 from 62.9%)
        
        dim_key = dim_mapping.get(dim_raw)
        if dim_key == "total":
            report.total_score = score
            report.total_pct = pct
        elif dim_key:
            report.dimension_scores[dim_key] = score
            report.dimension_pcts[dim_key] = pct
    
    # Check for safety belt section
    safety_belt_match = re.search(
        r'##\s*Safety.?Belt.*?Results(.*?)(?=\n##[^#]|\Z)',
        content,
        re.DOTALL | re.IGNORECASE
    )
    if safety_belt_match:
        report.safety_belt_triggered = True
        report.safety_belt_outcomes = safety_belt_match.group(1).strip()
    
    # Parse constraints observed section
    constraints_match = re.search(
        r'##\s*Constraints\s*Observed\s*\n+(.*?)(?=\n##[^#]|\n---|\Z)',
        content,
        re.DOTALL | re.IGNORECASE
    )
    if constraints_match:
        report.constraints_observed = constraints_match.group(1).strip()
    
    # Parse interpretation notes section
    interp_match = re.search(
        r'##\s*Interpretation\s*Notes\s*\n+(.*?)(?=\n##[^#]|\n---|\Z)',
        content,
        re.DOTALL | re.IGNORECASE
    )
    if interp_match:
        report.interpretation_notes = interp_match.group(1).strip()
    
    return report


def check_duplicate(session_id: str, csv_path: Path) -> bool:
    """Check if session_id already exists in local CSV."""
    if not csv_path.exists():
        return False
    
    with open(csv_path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('session_id') == session_id:
                return True
    return False


def ensure_csv_exists(csv_path: Path):
    """Create CSV with headers if it doesn't exist."""
    if not csv_path.exists():
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(SCHEMA_HEADERS)
        print(f"Created new CSV: {csv_path}")


def append_to_csv(report: WeatherReport, csv_path: Path):
    """Append report to local CSV."""
    ensure_csv_exists(csv_path)
    
    with open(csv_path, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(report.to_row())
    
    print(f"Appended to local CSV: {csv_path}")


def push_to_sheets(report: WeatherReport, sheet_id: str, creds_path: str):
    """Push report to Google Sheets."""
    if not GSPREAD_AVAILABLE:
        print("ERROR: gspread not installed. Run: pip install gspread google-auth")
        return False
    
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    credentials = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(credentials)
    
    spreadsheet = client.open_by_key(sheet_id)
    worksheet = spreadsheet.sheet1  # Use first sheet
    
    # Append the row
    worksheet.append_row(report.to_row(), value_input_option='USER_ENTERED')
    
    print(f"Pushed to Google Sheet: {sheet_id}")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Parse weather report markdown and upload to Google Sheets"
    )
    parser.add_argument("file", help="Path to weather report markdown file")
    parser.add_argument(
        "--dry-run", 
        action="store_true",
        help="Parse and validate only, don't write anywhere"
    )
    parser.add_argument(
        "--local-only",
        action="store_true", 
        help="Write to local CSV only, skip Google Sheets"
    )
    parser.add_argument(
        "--csv-path",
        type=Path,
        default=LOCAL_CSV_PATH,
        help=f"Path to local CSV (default: {LOCAL_CSV_PATH})"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip duplicate check"
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Auto-accept prompts (non-interactive mode for automation/Electron)"
    )
    
    args = parser.parse_args()
    
    # Read and parse file
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"ERROR: File not found: {file_path}")
        sys.exit(1)
    
    print(f"Parsing: {file_path}")
    content = file_path.read_text(encoding='utf-8')
    report = parse_markdown(content)
    
    # Display parsed data
    print(f"\n{'='*50}")
    print(f"Session ID: {report.session_id}")
    print(f"Date: {report.date}")
    print(f"Model: {report.model}")
    print(f"System State: {report.system_state}")
    print(f"Total Score: {report.total_score}/175 ({report.total_pct}%)")
    print(f"Safety Belt Triggered: {report.safety_belt_triggered}")
    print(f"Questions parsed: {len(report.scores)}/35")
    print(f"{'='*50}\n")
    
    # Validate
    errors = report.validate()
    if errors:
        print("VALIDATION ERRORS:")
        for error in errors:
            print(f"  - {error}")
        print()
        
        if args.yes:
            print("Auto-continuing (--yes flag set)")
        else:
            response = input("Continue anyway? [y/N]: ").strip().lower()
            if response != 'y':
                print("Aborted.")
                sys.exit(1)
    else:
        print("[OK] Validation passed\n")
    
    if args.dry_run:
        print("Dry run - no data written")
        print("\nRow preview:")
        row = report.to_row()
        for i, (header, value) in enumerate(zip(SCHEMA_HEADERS, row)):
            if value:  # Only show non-empty values
                display_val = str(value)[:50] + "..." if len(str(value)) > 50 else value
                print(f"  {header}: {display_val}")
        sys.exit(0)
    
    # Check for duplicates
    if not args.force and check_duplicate(report.session_id, args.csv_path):
        print(f"DUPLICATE: Session {report.session_id} already exists in CSV")
        if args.yes:
            print("Auto-continuing (--yes flag set)")
        else:
            response = input("Add anyway? [y/N]: ").strip().lower()
            if response != 'y':
                print("Aborted.")
                sys.exit(1)
    
    # Write to local CSV
    append_to_csv(report, args.csv_path)
    
    # Push to Google Sheets (unless local-only)
    if not args.local_only:
        sheet_id = os.environ.get('WEATHER_REPORT_SHEET_ID')
        creds_path = os.environ.get('GOOGLE_CREDENTIALS_PATH')
        
        # Resolve relative paths from script directory
        if creds_path and not Path(creds_path).is_absolute():
            creds_path = str(SCRIPT_DIR / creds_path)
        
        if not sheet_id or not creds_path:
            print("\nSkipping Google Sheets (env vars not set)")
            print("Set WEATHER_REPORT_SHEET_ID and GOOGLE_CREDENTIALS_PATH to enable")
        elif not Path(creds_path).exists():
            print(f"\nSkipping Google Sheets (credentials file not found: {creds_path})")
        else:
            push_to_sheets(report, sheet_id, creds_path)
    
    print("\nDone!")


if __name__ == "__main__":
    main()
