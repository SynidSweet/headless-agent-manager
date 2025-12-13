#!/bin/bash
# Quick E2E test runner for testing the test prompt

set -e

echo "======================================"
echo "E2E Test Infrastructure Verification"
echo "======================================"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "   Run: python3 -m venv venv"
    exit 1
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Check dependencies
echo "Checking dependencies..."
python3 --version
echo ""

if ! command -v pytest &> /dev/null; then
    echo "❌ pytest not found!"
    echo "   Run: pip install pytest"
    exit 1
fi

pytest --version
echo ""

# Run the E2E prompt test
echo "======================================"
echo "Running E2E Infrastructure Tests..."
echo "======================================"
echo ""

pytest tests/test_e2e_prompt.py -v --tb=short

echo ""
echo "======================================"
echo "✅ E2E Infrastructure Test Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  - Run all tests: ./run_e2e_tests.sh"
echo "  - Run specific test file: pytest tests/test_api.py -v"
echo "  - Run with coverage: pytest --cov=app --cov-report=html"
echo ""
