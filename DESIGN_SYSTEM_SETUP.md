# Design System Enforcement Setup Guide

## 🎯 What Was Implemented

Active ESLint enforcement that **blocks hardcoded colors at the code level**.

### Files Created/Modified

1. **eslint.config.js** - Added design system rules
2. **.lintstagedrc.json** - Lint before commits
3. **.husky/pre-commit** - Pre-commit hook
4. **.vscode/settings.json** - Editor integration
5. **test-design-violations.tsx** - Test file with violations

## 🚀 Quick Start

### 1. Initialize Husky (One-time setup)

```bash
npx husky install
chmod +x .husky/pre-commit
```

### 2. Test the Enforcement

```bash
# This should show 7 errors
npm run lint test-design-violations.tsx
```

Expected output:
```
❌ DESIGN SYSTEM VIOLATION: Use semantic tokens like 'text-card-foreground' instead of text-gray-*
❌ DESIGN SYSTEM VIOLATION: Use semantic tokens like 'bg-card' instead of bg-gray-*
... (7 total errors)
```

### 3. Test Pre-Commit Hook

```bash
# Try to commit the test file (should fail)
git add test-design-violations.tsx
git commit -m "test"

# Expected: Commit blocked with error messages
```

## 📋 Rules Enforced

### ❌ BLOCKED (Will Error)
- `text-gray-*` → Use `text-card-foreground`, `text-muted-foreground`
- `bg-gray-*` → Use `bg-card`, `bg-muted`, `bg-background`
- `border-gray-*` → Use `border-border`
- `text-white` → Use `text-foreground`, `text-card-foreground`
- `text-black` → Use `text-card-foreground`
- `bg-white` → Use `bg-card`, `bg-background`
- `bg-black` → Use `bg-background`

### ✅ ALLOWED
- All semantic tokens from design system
- Named colors for specific use cases (primary, accent, etc.)

## 🔧 Editor Integration

### VS Code (Auto-configured)

The `.vscode/settings.json` file enables:
- **Real-time linting** as you type
- **Auto-fix on save** for fixable issues
- **Red squiggles** under violations

### Other Editors

#### WebStorm/IntelliJ
1. Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
2. Enable "Automatic ESLint configuration"
3. Check "Run eslint --fix on save"

#### Vim/Neovim
Add to your config:
```vim
let g:ale_linters = {'typescript': ['eslint'], 'typescriptreact': ['eslint']}
let g:ale_fixers = {'typescript': ['eslint'], 'typescriptreact': ['eslint']}
let g:ale_fix_on_save = 1
```

## 🛠 Workflow Integration

### Before Committing
```bash
# Check your changes
npm run lint

# Auto-fix what's possible
npm run lint -- --fix
```

### CI/CD Integration
Add to your CI pipeline:
```yaml
- name: Lint Design System
  run: npm run lint
```

### Team Onboarding
New developers will automatically get violations blocked when they:
1. Type code (editor shows red squiggles)
2. Save files (auto-fix runs)
3. Try to commit (pre-commit hook blocks)

## 🚨 Bypassing (Emergency Only)

### Skip Pre-commit Hook
```bash
git commit --no-verify -m "Emergency fix"
```

**⚠️ Only use for:**
- Production hotfixes
- Third-party component issues
- Documented exceptions

### Disable ESLint for One Line
```tsx
// eslint-disable-next-line no-restricted-syntax
<div className="text-gray-900">
  {/* Document WHY this exception is needed */}
</div>
```

## 📊 Measuring Compliance

### Check Current Violations
```bash
npm run lint | grep "DESIGN SYSTEM VIOLATION" | wc -l
```

### Pre/Post Comparison
```bash
# Before fixes
git checkout main
npm run lint 2>&1 | grep -c "DESIGN SYSTEM VIOLATION"

# After fixes
git checkout feature-branch
npm run lint 2>&1 | grep -c "DESIGN SYSTEM VIOLATION"
```

## 🎓 Training & Documentation

### For Developers
1. Read `DESIGN_SYSTEM.md` for token reference
2. Run test file to see violations
3. Practice fixing violations with auto-fix

### Quick Reference Card
Print and post near monitors:
```
❌ text-gray-500  → ✅ text-card-foreground/70
❌ bg-white       → ✅ bg-card
❌ border-gray-200 → ✅ border-border
❌ text-white     → ✅ text-foreground
```

## 🔄 Updating Rules

To add new restrictions, edit `eslint.config.js`:

```javascript
{
  selector: "Literal[value=/your-pattern/]",
  message: "Your custom violation message"
}
```

## ✅ Success Metrics

**Enforcement is working when:**
- ✅ Test file shows 7 errors
- ✅ Editor shows red squiggles on violations
- ✅ Commits are blocked with violations
- ✅ New code uses semantic tokens
- ✅ Zero violations in `npm run lint`

## 🆘 Troubleshooting

### "husky command not found"
```bash
npm install
npx husky install
```

### "ESLint not finding violations"
```bash
# Restart ESLint server in VS Code
Cmd/Ctrl + Shift + P → "ESLint: Restart ESLint Server"
```

### "Pre-commit hook not running"
```bash
# Make hook executable
chmod +x .husky/pre-commit

# Test manually
.husky/pre-commit
```

## 🎉 Next Steps

1. Run initial audit: `npm run lint`
2. Fix all existing violations
3. Delete `test-design-violations.tsx`
4. Commit the clean codebase
5. Train team on new workflow

---

**Questions?** See `DESIGN_SYSTEM.md` for token reference or `.eslintrc-design-system.md` for implementation details.
