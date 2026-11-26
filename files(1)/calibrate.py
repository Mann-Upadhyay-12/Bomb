"""Confidence calibration for captcha prediction models.

Analyzes held-out predictions from cross-validation (e.g., cvstats_fold*.json from finetune.py
or cvstats_ctc_fold*.json from train_ctc.py) to select the optimal confidence cutoff for auto-copy.

Usage:
    python calibrate.py                     # Reads cvstats_fold*.json
    python calibrate.py cvstats_ctc_fold   # Reads cvstats_ctc_fold*.json
    python calibrate.py <path_or_prefix>    # Custom prefix or JSON file path
"""
import os
import sys
import glob
import json
import argparse
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_stats(prefix_or_path="cvstats_fold", search_dirs=None):
    """
    Search and load validation prediction stats from JSON files.

    Args:
        prefix_or_path: File path, prefix, or glob pattern.
        search_dirs: List of directory paths to search (defaults to cwd, files(1), build).

    Returns:
        tuple: (list of prediction records, list of matched file paths)
    """
    if search_dirs is None:
        search_dirs = [
            os.getcwd(),
            SCRIPT_DIR,
            os.path.join(SCRIPT_DIR, "..", "build"),
            os.path.abspath("build")
        ]

    matched_files = []

    # 1. Direct path or glob in cwd
    if os.path.isfile(prefix_or_path):
        matched_files = [prefix_or_path]
    else:
        # Check direct glob
        pattern = prefix_or_path if prefix_or_path.endswith('.json') else prefix_or_path + '*.json'
        matched_files = sorted(glob.glob(pattern))

        # Check in candidate directories
        if not matched_files:
            for sdir in search_dirs:
                if os.path.isdir(sdir):
                    candidate_pattern = os.path.join(sdir, os.path.basename(pattern))
                    found = sorted(glob.glob(candidate_pattern))
                    if found:
                        matched_files = found
                        break

    records = []
    for f in matched_files:
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
                if isinstance(data, list):
                    records.extend(data)
        except Exception as e:
            print(f"Warning: Failed reading {f}: {e}", file=sys.stderr)

    return records, matched_files


def compute_calibration(stats, thresholds=(0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90), min_precision=0.98):
    """
    Compute coverage and precision across candidate confidence thresholds.

    Args:
        stats: List of dicts with 'truth', 'pred', and 'prod' (or 'conf'/'prob')
        thresholds: Iterable of cutoff floats
        min_precision: Minimum precision required for the recommended threshold

    Returns:
        dict containing summary results and optimal cutoff
    """
    if not stats:
        return {
            "total": 0,
            "exact": 0,
            "overall_accuracy": 0.0,
            "rows": [],
            "best_cutoff": 0.70,
            "best_row": None
        }

    corrects = np.array([s.get('truth') == s.get('pred') for s in stats], dtype=bool)
    prods = np.array([float(s.get('prod', s.get('confidence', s.get('minp', 0.0)))) for s in stats], dtype=float)
    total = len(stats)
    overall_acc = float(corrects.mean())

    rows = []
    best_cutoff = 0.70
    best_row = None
    best_coverage = -1.0

    for th in sorted(thresholds):
        sel = prods >= th
        count = int(sel.sum())
        cov = count / float(total) if total > 0 else 0.0
        prec = float(corrects[sel].mean()) if count > 0 else 1.0

        row = {
            "threshold": th,
            "count": count,
            "total": total,
            "coverage": cov,
            "precision": prec
        }
        rows.append(row)

        # Select threshold that achieves target precision with maximum coverage
        if prec >= min_precision and count > 0 and cov > best_coverage:
            best_coverage = cov
            best_cutoff = th
            best_row = row

    if best_row is None and rows:
        # Fallback to threshold that maximizes precision
        best_row = max(rows, key=lambda r: (r["precision"], r["coverage"]))
        best_cutoff = best_row["threshold"]

    return {
        "total": total,
        "exact": int(corrects.sum()),
        "overall_accuracy": overall_acc,
        "rows": rows,
        "best_cutoff": best_cutoff,
        "best_row": best_row
    }


def print_calibration_report(calib_results, matched_files=None):
    """Format and display calibration summary table."""
    total = calib_results["total"]
    if total == 0:
        print("No evaluation stats records found.")
        print("To generate stats, run cross-validation:")
        print("  - Slot model:  python finetune.py cv 300")
        print("  - CTC model:   python train_ctc.py cv --steps 800")
        return

    if matched_files:
        print(f"Loaded {total} held-out predictions from {len(matched_files)} file(s):")
        for f in matched_files:
            print(f"  - {os.path.basename(f)}")
    else:
        print(f"Loaded {total} held-out predictions.")

    exact = calib_results["exact"]
    acc = calib_results["overall_accuracy"]
    print(f"\nOverall held-out exact accuracy: {exact}/{total} ({acc * 100:.2f}%)")
    print("\nCutoff Calibration Table:")
    print(f"  {'Cutoff':<8} | {'Auto-copies':<13} | {'Coverage':<10} | {'Precision':<10}")
    print("  " + "-" * 50)

    for r in calib_results["rows"]:
        marker = " <-- Recommended" if r["threshold"] == calib_results["best_cutoff"] else ""
        print(f"  {r['threshold']:<8.2f} | {r['count']:<4}/{r['total']:<8} | {r['coverage']*100:<9.1f}% | {r['precision']*100:<9.2f}%{marker}")

    best = calib_results["best_row"]
    if best:
        print(f"\nRecommended cutoff: {calib_results['best_cutoff']:.2f}")
        print(f"  Yields {best['count']}/{total} ({best['coverage']*100:.1f}%) auto-copies with {best['precision']*100:.2f}% accuracy.")


def main():
    parser = argparse.ArgumentParser(description="Calibrate captcha confidence cutoff.")
    parser.add_argument("prefix", nargs="?", default="cvstats_fold",
                        help="Stats file prefix or path (default: cvstats_fold, or cvstats_ctc_fold)")
    parser.add_argument("--min-precision", type=float, default=0.98,
                        help="Target precision threshold (default: 0.98)")
    parser.add_argument("--dir", dest="search_dir", default=None,
                        help="Specific directory to search for fold stats")
    args = parser.parse_args()

    search_dirs = [args.search_dir] if args.search_dir else None
    stats, files = load_stats(args.prefix, search_dirs=search_dirs)
    results = compute_calibration(stats, min_precision=args.min_precision)
    print_calibration_report(results, files)


if __name__ == '__main__':
    main()
