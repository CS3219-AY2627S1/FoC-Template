"""Run from supplier-service: python -m tools.nus_collector --help."""

import argparse
import csv
import json
from pathlib import Path

from .workflow import BASELINE, collect, export, report, validate


def main(argv=None):
    parser = argparse.ArgumentParser(description="Collect, curate, validate and export a separate NUS supplier dataset.")
    parser.add_argument("command", choices=("collect", "report", "validate", "export"))
    parser.add_argument("--dataset", type=Path, required=True, help="Directory for snapshots, review.csv, report and seed bundle.")
    parser.add_argument("--snapshots", type=Path, help="Offline directory containing kent-ridge.html, utown.html and retail.html.")
    parser.add_argument("--baseline", type=Path, default=BASELINE, help="Existing CP1252 seed CSV used to detect duplicates.")
    args = parser.parse_args(argv)
    if args.snapshots and args.command != "collect":
        parser.error("--snapshots applies only to collect")
    try:
        if args.command == "collect":
            state = collect(args.dataset, args.snapshots)
            result = report(args.dataset, args.baseline)
            result.update(valid=state["complete"], collection_complete=state["complete"],
                          report=str(args.dataset / "report.html"))
        else:
            result = {"report": report, "validate": validate, "export": export}[args.command](args.dataset, args.baseline)
    except (OSError, ValueError, KeyError, TypeError, csv.Error) as error:
        result = {"valid": False, "error": str(error)}
    print(json.dumps(result, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
