@echo off
title FOR2D ROYAL - Serveur Simple
color 0A

echo.
echo ========================================
echo     FOR2D ROYAL - SERVEUR SIMPLE
echo ========================================
echo.
echo Demarrage du serveur HTTP simple...
echo.

REM Essayer avec Python (la methode la plus simple)
python -m http.server 8080 2>nul
if %errorlevel% equ 0 goto :end

REM Essayer avec python3
python3 -m http.server 8080 2>nul
if %errorlevel% equ 0 goto :end

REM Essayer avec py
py -m http.server 8080 2>nul
if %errorlevel% equ 0 goto :end

REM Si Python n'est pas disponible
echo.
echo Python n'est pas disponible.
echo.
echo ALTERNATIVE: Utilisez le serveur integre de VSCode
echo 1. Installez l'extension "Live Server" dans VSCode
echo 2. Clic droit sur index.html
echo 3. "Open with Live Server"
echo.
echo OU: Ouvrez index.html directement
echo    (fonctionne en solo, reseau limite)
echo.

:end
pause
