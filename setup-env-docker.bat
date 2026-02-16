@echo off
setlocal

docker run --rm -it -v "%cd%:/work" -w /work node:24-alpine node scripts/setup-env.js
if errorlevel 1 exit /b %errorlevel%

echo.
echo .env setup completed.
