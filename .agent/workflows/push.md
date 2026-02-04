---
description: Quick commit and push to GitHub
---

# Push to GitHub

Push all staged/unstaged changes to GitHub with a commit message.

// turbo-all

## Steps

1. Stage all changes:
```powershell
git add -A
```

2. Commit with a conventional commit message (ask user for message if not provided):
```powershell
git commit -m "<type>: <description>"
```
Types: `fix`, `feat`, `refactor`, `docs`, `chore`, `style`, `perf`, `test`

3. Push to the current branch:
```powershell
git push
```

## Notes
- If the user provides a commit message, use it directly
- If no message provided, generate a concise message based on the changes
- Use conventional commit format: `<type>: <description>`
