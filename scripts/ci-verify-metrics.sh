#!/bin/bash
# CI Integration Script for Metric Accuracy Verification
#
# This script runs in CI to prevent merging code with hardcoded estimates.
# Stops the build if any violations are found.
#
# Usage in CI:
#   bash scripts/ci-verify-metrics.sh

set -e

echo "========================================="
echo "Metric Accuracy Verification (CI)"
echo "========================================="
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "[HALT] Node.js is not installed"
    exit 2
fi

# Run the verification on all source files
echo "🔍 Checking all source files for metric accuracy violations..."
echo ""

if node scripts/verify-metrics-accuracy.mjs --all; then
    echo ""
    echo "========================================="
    echo "[OK] CI Check Passed"
    echo "========================================="
    echo ""
    echo "No metric accuracy violations found."
    echo "Safe to merge."
    echo ""
    exit 0
else
    EXIT_CODE=$?
    echo ""
    echo "========================================="
    echo "[HALT] CI Check Did Not Pass"
    echo "========================================="
    echo ""
    echo "Metric accuracy violations detected."
    echo "Please fix the violations before merging."
    echo ""
    echo "To run locally:"
    echo "  npm run verify:metrics"
    echo ""
    echo "To see help:"
    echo "  node scripts/verify-metrics-accuracy.mjs --help"
    echo ""
    exit $EXIT_CODE
fi
