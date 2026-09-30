@echo off
title FOR2D ROYAL - Serveur Local
color 0A

echo.
echo ========================================
echo     FOR2D ROYAL - SERVEUR LOCAL
echo ========================================
echo.
echo Demarrage du serveur en cours...
echo.

REM Verifier si Node.js est installe
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERREUR: Node.js n'est pas installe!
    echo.
    echo Telechargez Node.js depuis: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Demarrer le serveur
node server/server.js

pause
