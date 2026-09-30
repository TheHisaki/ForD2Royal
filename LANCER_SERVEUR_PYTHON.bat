@echo off
title FOR2D ROYAL - Serveur Local Python
color 0A

echo.
echo ========================================
echo     FOR2D ROYAL - SERVEUR LOCAL
echo ========================================
echo.

REM Essayer Python 3
python --version >nul 2>nul
if %errorlevel% equ 0 (
    echo Demarrage du serveur avec Python...
    python LANCER_SERVEUR.py
    goto :end
)

REM Essayer python3
python3 --version >nul 2>nul
if %errorlevel% equ 0 (
    echo Demarrage du serveur avec Python3...
    python3 LANCER_SERVEUR.py
    goto :end
)

REM Essayer py
py --version >nul 2>nul
if %errorlevel% equ 0 (
    echo Demarrage du serveur avec py...
    py LANCER_SERVEUR.py
    goto :end
)

REM Python non trouve
echo.
echo ERREUR: Python n'est pas installe ou pas dans le PATH!
echo.
echo Solution simple: Utilisez la methode alternative
echo Double-cliquez sur: SERVEUR_SIMPLE.bat
echo.

:end
pause
