#!/bin/bash
# Quick script to run event emission test

# Check if Python dependencies are installed
if ! python3 -c "import socketio" 2>/dev/null; then
    echo "Installing required dependencies..."
    pip install python-socketio requests
fi

# Run the test
python3 test_event_emission.py
