@echo off
REM API Test Script for Windows
REM Tests all endpoints of AI Operations Command Center

echo.
echo ============================================
echo AI Operations Command Center - API Tests
echo ============================================
echo.

set API_BASE=http://localhost:3001/api
set PASSED=0
set FAILED=0

echo 1. Testing Health Check...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/health
echo.

echo.
echo 2. Testing Status Endpoint...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/status
echo.

echo.
echo 3. Testing Dashboard Endpoint...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/dashboard
echo.

echo.
echo 4. Testing Signals Endpoint...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/signals
echo.

echo.
echo 5. Testing Classifications Endpoint...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/classifications
echo.

echo.
echo 6. Testing Actions Endpoint...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/actions
echo.

echo.
echo 7. Testing Metrics Endpoint...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/metrics
echo.

echo.
echo 8. Testing Workflow Endpoint (POST)...
curl -s -o NUL -w "HTTP %%{http_code}" -X POST -H "Content-Type: application/json" -d "{\"type\":\"test\"}" %API_BASE%/workflows
echo.

echo.
echo 9. Testing 404 Error Handling...
curl -s -o NUL -w "HTTP %%{http_code}" %API_BASE%/invalid-endpoint
echo.

echo.
echo ============================================
echo Getting Full Dashboard Data...
echo ============================================
curl -s %API_BASE%/dashboard
echo.

echo.
echo ============================================
echo Getting Health Status...
echo ============================================
curl -s %API_BASE%/health
echo.

echo.
echo ============================================
echo Tests Complete!
echo ============================================
echo.
echo Check that all endpoints returned HTTP 200
echo (except /invalid-endpoint which should be 404)
echo.
pause
