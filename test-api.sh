#!/bin/bash
# API Test Script - Tests all endpoints
# Usage: ./test-api.sh

echo "🧪 AI Operations Command Center - API Test Suite"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_BASE="http://localhost:3001/api"
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected=$4
    
    echo -n "Testing ${method} ${endpoint}... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "${API_BASE}${endpoint}")
    else
        response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "${API_BASE}${endpoint}")
    fi
    
    if [ "$response" == "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected, got $response)"
        ((FAILED++))
    fi
}

# Function to test JSON response
test_json_response() {
    local method=$1
    local endpoint=$2
    local field=$3
    
    echo -n "Testing ${method} ${endpoint} (JSON)... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s "${API_BASE}${endpoint}")
    fi
    
    # Check if response contains expected field
    if echo "$response" | grep -q "$field"; then
        echo -e "${GREEN}✓ PASS${NC} (Contains '$field')"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Missing '$field')"
        ((FAILED++))
        return 1
    fi
}

echo "1️⃣  Testing Health & Status Endpoints"
echo "────────────────────────────────────"
test_endpoint "GET" "/health" "" "200"
test_json_response "GET" "/health" "success"
test_endpoint "GET" "/status" "" "200"
test_json_response "GET" "/status" "success"
echo ""

echo "2️⃣  Testing Dashboard Endpoints"
echo "────────────────────────────────────"
test_endpoint "GET" "/dashboard" "" "200"
test_json_response "GET" "/dashboard" "success"
test_json_response "GET" "/dashboard" "liveSignals"
test_json_response "GET" "/dashboard" "performance"
echo ""

echo "3️⃣  Testing Data Endpoints"
echo "────────────────────────────────────"
test_endpoint "GET" "/signals" "" "200"
test_json_response "GET" "/signals" "success"
test_endpoint "GET" "/classifications" "" "200"
test_json_response "GET" "/classifications" "success"
test_endpoint "GET" "/actions" "" "200"
test_json_response "GET" "/actions" "success"
test_endpoint "GET" "/metrics" "" "200"
test_json_response "GET" "/metrics" "success"
echo ""

echo "4️⃣  Testing Workflow Endpoint"
echo "────────────────────────────────────"
workflow_data='{"type":"signal_processing","payload":{"signalId":"test-123"}}'
test_endpoint "POST" "/workflows" "$workflow_data" "200"
echo ""

echo "5️⃣  Testing Error Handling"
echo "────────────────────────────────────"
test_endpoint "GET" "/invalid-endpoint" "" "404"
echo ""

# Summary
echo "================================================"
echo "📊 Test Summary"
echo "================================================"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
