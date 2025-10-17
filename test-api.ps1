# API Test Script - PowerShell Version
# Tests all API endpoints and reports results

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AI Operations Command Center - API Tests" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$apiBase = "http://localhost:3001/api"
$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Description,
        [object]$Body = $null
    )
    
    Write-Host -NoNewline "Testing $Description... "
    
    try {
        $url = "$apiBase$Endpoint"
        
        if ($Method -eq "GET") {
            $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing
        } else {
            $jsonBody = $Body | ConvertTo-Json
            $response = Invoke-WebRequest -Uri $url -Method POST -Body $jsonBody -ContentType "application/json" -UseBasicParsing
        }
        
        if ($response.StatusCode -eq 200) {
            Write-Host "PASS" -ForegroundColor Green
            Write-Host "  └─ HTTP $($response.StatusCode)" -ForegroundColor Gray
            $script:passed++
            return $response.Content | ConvertFrom-Json
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            Write-Host "  └─ HTTP $($response.StatusCode)" -ForegroundColor Gray
            $script:failed++
            return $null
        }
    } catch {
        Write-Host "FAIL" -ForegroundColor Red
        Write-Host "  └─ Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

function Test-404 {
    param([string]$Endpoint)
    
    Write-Host -NoNewline "Testing 404 handling... "
    
    try {
        $url = "$apiBase$Endpoint"
        $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -ErrorAction Stop
        Write-Host "FAIL (Should have returned 404)" -ForegroundColor Red
        $script:failed++
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 404) {
            Write-Host "PASS" -ForegroundColor Green
            Write-Host "  └─ HTTP 404" -ForegroundColor Gray
            $script:passed++
        } else {
            Write-Host "FAIL (Wrong status code)" -ForegroundColor Red
            $script:failed++
        }
    }
}

# Test 1: Health & Status
Write-Host ""
Write-Host "[1] Health & Status Endpoints" -ForegroundColor Yellow
Write-Host "------------------------------" -ForegroundColor Gray
$health = Test-Endpoint "GET" "/health" "Health Check"
if ($health -and $health.success) {
    Write-Host "  ✓ Health status: $($health.data.status)" -ForegroundColor Green
    Write-Host "  ✓ Uptime: $([math]::Round($health.data.uptime, 2))s" -ForegroundColor Green
}

$status = Test-Endpoint "GET" "/status" "System Status"
if ($status -and $status.success) {
    Write-Host "  ✓ Integrations found: $($status.data.integrations.Count)" -ForegroundColor Green
}

# Test 2: Dashboard
Write-Host ""
Write-Host "[2] Dashboard Endpoint" -ForegroundColor Yellow
Write-Host "----------------------" -ForegroundColor Gray
$dashboard = Test-Endpoint "GET" "/dashboard" "Dashboard Data"
if ($dashboard -and $dashboard.success) {
    Write-Host "  ✓ Live signals: $($dashboard.data.liveSignals.Count)" -ForegroundColor Green
    Write-Host "  ✓ Recent decisions: $($dashboard.data.recentDecisions.Count)" -ForegroundColor Green
    Write-Host "  ✓ Pending reviews: $($dashboard.data.pendingReviews.Count)" -ForegroundColor Green
}

# Test 3: Data Endpoints
Write-Host ""
Write-Host "[3] Data Endpoints" -ForegroundColor Yellow
Write-Host "------------------" -ForegroundColor Gray
$signals = Test-Endpoint "GET" "/signals" "Signals"
if ($signals -and $signals.success) {
    Write-Host "  ✓ Signals returned: $($signals.data.Count)" -ForegroundColor Green
}

$classifications = Test-Endpoint "GET" "/classifications" "Classifications"
if ($classifications -and $classifications.success) {
    Write-Host "  ✓ Classifications returned: $($classifications.data.Count)" -ForegroundColor Green
}

$actions = Test-Endpoint "GET" "/actions" "Actions"
if ($actions -and $actions.success) {
    Write-Host "  ✓ Actions returned: $($actions.data.Count)" -ForegroundColor Green
}

$metrics = Test-Endpoint "GET" "/metrics" "Metrics"
if ($metrics -and $metrics.success) {
    Write-Host "  ✓ Metrics data available" -ForegroundColor Green
}

# Test 4: Workflow
Write-Host ""
Write-Host "[4] Workflow Endpoint" -ForegroundColor Yellow
Write-Host "---------------------" -ForegroundColor Gray
$workflowPayload = @{
    type = "signal_processing"
    payload = @{
        signalId = "test-123"
        source = "api-test"
        content = "Test signal from PowerShell"
    }
}
$workflow = Test-Endpoint "POST" "/workflows" "Workflow Execution" -Body $workflowPayload
if ($workflow -and $workflow.success) {
    Write-Host "  ✓ Workflow ID: $($workflow.data.workflowId)" -ForegroundColor Green
}

# Test 5: Error Handling
Write-Host ""
Write-Host "[5] Error Handling" -ForegroundColor Yellow
Write-Host "------------------" -ForegroundColor Gray
Test-404 "/invalid-endpoint"

# Summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Passed: " -NoNewline
Write-Host $passed -ForegroundColor Green
Write-Host "Failed: " -NoNewline
Write-Host $failed -ForegroundColor Red
Write-Host ""

if ($failed -eq 0) {
    Write-Host "[PASS] All tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your API is working perfectly!" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Open http://localhost:5173/ in your browser" -ForegroundColor White
    Write-Host "  2. Check the dashboard loads correctly" -ForegroundColor White
    Write-Host "  3. See DEMO-GUIDE.md for presentation tips" -ForegroundColor White
    exit 0
} else {
    Write-Host "[FAIL] Some tests failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check backend is running: npm run dev" -ForegroundColor White
    Write-Host "  2. Verify port 3001 is not in use" -ForegroundColor White
    Write-Host "  3. Check backend logs for errors" -ForegroundColor White
    exit 1
}
