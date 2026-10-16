$ErrorActionPreference = 'Continue'
Set-Location 'e:\Projet\Site Internet\ForD2Royal-main'
# Arrêt du serveur de test resté sur le port 3000
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
foreach ($f in Get-ChildItem js/nexus/*.js) { node --check $f.FullName; if ($LASTEXITCODE -ne 0) { "SYNTAXE KO $($f.Name)"; exit 1 } }
node --check js/lobby.js
Remove-Item _nx_sim.mjs, _nx_shot.mjs, _nx_a.png, _nx_b.png, _nx_sim.txt -ErrorAction SilentlyContinue
git status --short
git add .
git commit -m "update" -q
git push -u origin main 2>&1 | Out-String
git status -sb
git log -1 --oneline
