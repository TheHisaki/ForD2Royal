# Mise à jour GitHub après chaque tâche

À la fin de chaque tâche terminée (après les vérifications), mettre à jour le dépôt GitHub :

```powershell
git add .
git commit -m "update"
git push -u origin main
```

- Vérifier d'abord `git status` : ne rien pousser de sensible (fichiers .env, clés, mots de passe) ni de fichiers temporaires de test (`_*.html`, `_*.mjs`, `_*.txt`).
- Si `git commit` indique qu'il n'y a rien à valider, ne pas pousser.
- Vérifier que le push a réussi (`git status -sb` doit afficher `main...origin/main` sans retard).
