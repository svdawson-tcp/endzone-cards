# Design System Enforcement Verification Checklist

Run these tests to verify the enforcement system is working correctly.

## ✅ Step 1: Install Dependencies

```bash
npm install
npx husky install
chmod +x .husky/pre-commit
```

Expected: No errors, hook is executable

---

## ✅ Step 2: Test ESLint Rules

```bash
npm run lint test-design-violations.tsx
```

**Expected Output:** 7 errors with messages like:
```
error  ❌ DESIGN SYSTEM VIOLATION: Use semantic tokens like 'text-card-foreground' instead of text-gray-*
```

**If you see 0 errors:** ESLint rules aren't loading. Check `eslint.config.js` syntax.

---

## ✅ Step 3: Test Editor Integration (VS Code)

1. Open `test-design-violations.tsx` in VS Code
2. Look for **red squiggles** under violations
3. Hover over squiggle to see error message

**Expected:** Red squiggles on lines 14, 19, 24, 29, 34, 39, 44

**If no squiggles:**
- Restart ESLint server: `Cmd/Ctrl + Shift + P` → "ESLint: Restart ESLint Server"
- Check `.vscode/settings.json` exists

---

## ✅ Step 4: Test Auto-Fix

```bash
# Create a test file with fixable issues
echo 'export const Test = () => <div className="px-4 py-2 text-sm">Test</div>;' > test-autofix.tsx

# Run auto-fix
npm run lint -- --fix test-autofix.tsx

# Clean up
rm test-autofix.tsx
```

**Expected:** File is automatically formatted (order/spacing fixed)

---

## ✅ Step 5: Test Pre-Commit Hook

```bash
# Try to commit the violation file
git add test-design-violations.tsx
git commit -m "test: violations"
```

**Expected Output:**
```
❌ COMMIT BLOCKED: Design system violations detected
   Fix the errors above before committing
   See DESIGN_SYSTEM.md for guidance
```

**If commit succeeds:** Hook isn't running. Check:
- Is `.husky/pre-commit` executable? `ls -la .husky/pre-commit`
- Did you run `npx husky install`?

---

## ✅ Step 6: Test Bypass (Emergency)

```bash
git commit --no-verify -m "emergency bypass"
```

**Expected:** Commit succeeds (hook skipped)

⚠️ **Important:** Reset this test commit:
```bash
git reset HEAD~1
```

---

## ✅ Step 7: Verify Good Code Passes

```bash
# The good component should have 0 errors
npm run lint test-design-violations.tsx 2>&1 | grep "GoodComponent"
```

**Expected:** No errors related to GoodComponent

---

## ✅ Step 8: Test Real Files

```bash
# Check all TypeScript files
npm run lint
```

**Expected:** Shows current violation count

**Goal:** 0 violations in production code

---

## 📊 Verification Results

After running all tests, you should see:

| Test | Status | Expected Result |
|------|--------|-----------------|
| 1. Dependencies installed | ✅ | No errors |
| 2. ESLint detects violations | ✅ | 7 errors shown |
| 3. Editor shows squiggles | ✅ | Red underlines visible |
| 4. Auto-fix works | ✅ | Format changes applied |
| 5. Pre-commit blocks | ✅ | Commit rejected |
| 6. Bypass works | ✅ | Commit succeeds with --no-verify |
| 7. Good code passes | ✅ | 0 errors |
| 8. Codebase audit complete | ✅ | Violations counted |

---

## 🎯 Success Criteria

✅ **Enforcement is ACTIVE when:**
- All 8 tests pass
- Violations show in editor immediately
- Cannot commit files with violations
- Team members see violations on their machines

---

## 🚨 Common Issues

### Issue: "command not found: npx"
**Fix:** Update npm: `npm install -g npm@latest`

### Issue: Hook not running
**Fix:** 
```bash
npx husky install
chmod +x .husky/pre-commit
git config core.hooksPath .husky
```

### Issue: ESLint not loading rules
**Fix:** Check `eslint.config.js` for syntax errors:
```bash
node eslint.config.js
```

### Issue: VS Code not showing errors
**Fix:**
1. Install ESLint extension
2. Reload window: `Cmd/Ctrl + Shift + P` → "Reload Window"
3. Check ESLint output panel

---

## 📝 After Verification

Once all tests pass:

1. ✅ Delete test file: `rm test-design-violations.tsx`
2. ✅ Fix real violations: `npm run lint -- --fix`
3. ✅ Commit clean code: `git add . && git commit -m "feat: enforce design system"`
4. ✅ Document for team in README

---

**Verification Date:** _____________

**Verified By:** _____________

**Status:** ⬜ PASSED  ⬜ FAILED  ⬜ PARTIAL
