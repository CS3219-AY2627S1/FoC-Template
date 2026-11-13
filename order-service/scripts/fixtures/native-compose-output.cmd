@echo off
rem Native stderr fixture only: no Docker, cloud, credentials or database calls.
rem Invoke-Compose prepends seven Compose arguments, so argument eight is the case.
if "%~8"=="fail" (
  >&2 echo fixture-private-stderr
  exit /b 23
)
if "%~8"=="silent-fail" exit /b 24
if "%~8"=="empty" exit /b 0
>&2 echo Network fixture_default Creating
echo {"fixture":true}
exit /b 0
