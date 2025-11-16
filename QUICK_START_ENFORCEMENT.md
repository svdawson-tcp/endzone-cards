# 🚀 Quick Start: Design System Enforcement

**Status:** ✅ ACTIVE - Violations are automatically blocked

---

## 1️⃣ One-Time Setup (30 seconds)

```bash
# Install dependencies
npm install

# Initialize git hooks
npx husky install

# Make pre-commit hook executable
chmod +x .husky/pre-commit
```

**✅ Done!** Enforcement is now active.

---

## 2️⃣ Verify It Works (1 minute)

```bash
# Should show 7 design system errors
npm run lint test-design-violations.tsx
```

**Expected:** Red error messages about using semantic tokens

---

## 3️⃣ Daily Workflow

### While Coding

Your editor shows **red squiggles** under violations:
```tsx
// ❌ Red squiggle appears here
<div className="text-gray-900">Bad</div>

// ✅ No squiggle - correct!
<div className="text-card-foreground">Good</div>
```

### Before Committing

```bash
# Check for violations
npm run lint

# Auto-fix what's possible
npm run lint -- --fix
```

### When Committing

Pre-commit hook automatically runs. If violations exist:
```
❌ COMMIT BLOCKED: Design system violations detected
   Fix the errors above before committing
```

**Fix the errors**, then try again.

---

## 4️⃣ Quick Reference

### ❌ Don't Use
- `text-gray-*` → `text-card-foreground`
- `bg-white` → `bg-card`
- `border-gray-*` → `border-border`
- `text-white` → `text-foreground`

### ✅ Do Use
- `text-card-foreground` - Dark text on light backgrounds
- `text-card-foreground/80` - Secondary text
- `text-card-foreground/70` - Helper text
- `bg-card` - Card backgrounds
- `bg-background` - Page backgrounds
- `border-border` - All borders

---

## 5️⃣ Common Scenarios

### "I need white text on dark background"
```tsx
// ❌ Wrong
<div className="bg-primary text-white">

// ✅ Correct
<div className="bg-primary text-primary-foreground">
```

### "I need muted/secondary text"
```tsx
// ❌ Wrong
<p className="text-gray-600">

// ✅ Correct
<p className="text-card-foreground/70">
```

### "I need a light background"
```tsx
// ❌ Wrong
<div className="bg-gray-100">

// ✅ Correct
<div className="bg-muted">
```

---

## 🆘 Emergency Bypass

**Only use if absolutely necessary** (production hotfix, etc.):

```bash
# Skip pre-commit hook
git commit --no-verify -m "emergency fix"
```

⚠️ **Document why** in commit message and create follow-up ticket to fix properly.

---

## 📚 Full Documentation

- **Token Reference:** `DESIGN_SYSTEM.md`
- **Setup Guide:** `DESIGN_SYSTEM_SETUP.md`
- **Verification:** `ENFORCEMENT_VERIFICATION.md`

---

## ✅ Success Checklist

- [ ] Setup complete (`npm install`, `npx husky install`)
- [ ] Test file shows 7 errors
- [ ] Editor shows red squiggles on violations
- [ ] Pre-commit hook blocks bad commits
- [ ] Team trained on semantic tokens

---

**Questions?** Check `DESIGN_SYSTEM.md` or ask the team.

**Enforcement Active:** 🟢 YES
