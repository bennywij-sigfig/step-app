#!/bin/bash

# Load Test Runner for Step Challenge App
# Usage: ./run-load-test.sh [auth|basic] [user_count] [base_url]

set -e

echo "🚀 Step Challenge App Load Test Runner"
echo "======================================"

# Parse arguments
TEST_TYPE=${1:-"auth"}
USER_COUNT=${2:-"suite"}
BASE_URL=${3:-"https://step-app-4x-yhw.fly.dev"}

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed. Please install Node.js and try again."
    exit 1
fi

# Create results directory if it doesn't exist
mkdir -p load-test-results

echo "📅 Target URL: $BASE_URL"
echo "🔧 Test type: $TEST_TYPE"
echo "👥 Test configuration: $USER_COUNT"
echo ""

if [ "$TEST_TYPE" = "auth" ]; then
    # Authenticated load test
    if [ ! -f "tests/authenticated-load-test.js" ]; then
        echo "❌ tests/authenticated-load-test.js not found"
        exit 1
    fi
    
    # Check if test users exist, create them if needed
    if [ ! -f "tests/test-sessions.json" ]; then
        echo "📋 No test sessions found. Creating test users..."
        cd tests && node create-test-users.js create 25 && cd ..
    fi
    
    if [ "$USER_COUNT" = "suite" ]; then
        echo "🎯 Running authenticated test suite (10, 20, 40 users)..."
        cd tests && node authenticated-load-test.js && cd ..
    else
        echo "🎯 Running single authenticated test with $USER_COUNT users..."
        cd tests && node authenticated-load-test.js "$USER_COUNT" "$BASE_URL" && cd ..
    fi
    
elif [ "$TEST_TYPE" = "basic" ]; then
    # Basic (unauthenticated) load test
    if [ ! -f "tests/load-test.js" ]; then
        echo "❌ tests/load-test.js not found"
        exit 1
    fi
    
    if [ "$USER_COUNT" = "suite" ]; then
        echo "🎯 Running basic test suite (10, 20, 40 users)..."
        cd tests && node load-test.js && cd ..
    else
        echo "🎯 Running single basic test with $USER_COUNT users..."
        cd tests && node load-test.js "$USER_COUNT" "$BASE_URL" && cd ..
    fi
    
else
    echo "❌ Invalid test type: $TEST_TYPE"
    echo "Usage: ./run-load-test.sh [auth|basic] [user_count] [base_url]"
    echo ""
    echo "Examples:"
    echo "  ./run-load-test.sh auth              # Run authenticated test suite"
    echo "  ./run-load-test.sh auth 15           # Run 15 authenticated users"
    echo "  ./run-load-test.sh basic 10          # Run 10 basic users"
    echo "  ./run-load-test.sh basic suite       # Run basic test suite"
    exit 1
fi

echo ""
echo "✅ Load test completed!"
echo "📊 Results saved in load-test-results/ directory"