# Husky Git Hooks

This directory contains Git hooks that enforce design system compliance.

## Pre-commit Hook

Runs before every commit to check for design system violations.

### What it does:
1. Runs ESLint on staged files
2. Checks for hardcoded colors (text-gray-*, bg-white, etc.)
3. Blocks commit if violations found

### Setup:
```bash
npx husky install
chmod +x .husky/pre-commit
```

### Bypass (emergency only):
```bash
git commit --no-verify -m "message"
```
