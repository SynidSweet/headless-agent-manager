#!/bin/bash
# E2E Test Runner for Claude Proxy Service
# Run this to execute all E2E tests

set -e

echo "======================================"
echo "Claude Proxy Service E2E Test Runner"
echo "======================================"
echo ""

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Check Python version
echo "Python version:"
python3 --version
echo ""

# Check pytest is installed
echo "Pytest version:"
pytest --version
echo ""

# Run tests with verbose output
echo "======================================"
echo "Running All Tests..."
echo "======================================"
echo ""

pytest -v --tb=short

echo ""
echo "======================================"
echo "Test Run Complete!"
echo "======================================"
