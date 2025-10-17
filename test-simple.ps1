# Simple API Test Script
Write-Host "Testing API Endpoints..." -ForegroundColor Cyan

$apiBase = "http://localhost:3001/api"

# Test Health
Write-Host "1. Testing /api/health..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "$apiBase/health" -Method GET
    if ($response.success) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Dashboard
Write-Host "2. Testing /api/dashboard..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "$apiBase/dashboard" -Method GET
    if ($response.success) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Signals
Write-Host "3. Testing /api/signals..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "$apiBase/signals" -Method GET
    if ($response.success) {
        Write-Host " OK (Found $($response.data.Count) signals)" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Actions
Write-Host "4. Testing /api/actions..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "$apiBase/actions" -Method GET
    if ($response.success) {
        Write-Host " OK (Found $($response.data.Count) actions)" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Metrics
Write-Host "5. Testing /api/metrics..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "$apiBase/metrics" -Method GET
    if ($response.success) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "All tests complete!" -ForegroundColor Cyan
Write-Host "Frontend should be at: http://localhost:5173/" -ForegroundColor Yellow
