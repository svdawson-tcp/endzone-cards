# EndZone Design System

## 🚨 ACTIVE ENFORCEMENT

This design system is **automatically enforced** by ESLint. Violations will:
- Show **red squiggles** in your editor
- **Block commits** via pre-commit hooks
- **Fail CI/CD** builds

### Testing Enforcement

Run `npm run lint` to check for violations:
```bash
npm run lint
```

Test with intentional violations:
```bash
npm run lint test-design-violations.tsx
# Should show 7 errors
```

### Bypassing (NOT RECOMMENDED)

Only bypass if absolutely necessary:
```bash
# Skip pre-commit hooks (emergency only)
git commit --no-verify -m "message"

# Disable ESLint for one line (document why)
// eslint-disable-next-line no-restricted-syntax
<div className="text-gray-900">Documented exception</div>
```

## Overview
This document defines the design system standards for the EndZone card trading application. All components and pages must follow these guidelines to ensure consistent, accessible, and maintainable UI across the application.

## Semantic Color Tokens

### Text Colors (Light Backgrounds)
Use these for text on white/light card backgrounds:

- **`card-foreground`** - Primary text on cards (titles, main content)
  - Example: Card titles, important labels
  - Contrast: High contrast for readability

- **`card-foreground/80`** - Secondary text (body content)
  - Example: Descriptions, paragraph text
  - Contrast: Good readability, slightly softer

- **`card-foreground/70`** - Tertiary text (helper text)
  - Example: Labels, metadata, supporting information
  - Contrast: Readable but de-emphasized

- **`card-foreground/60`** - Quaternary text (subtle text)
  - Example: Placeholder text, very subtle hints
  - Contrast: Minimum readable contrast

### Text Colors (Dark Backgrounds)
Use these for text on dark/colored backgrounds:

- **`foreground`** - Primary text on page backgrounds
  - Example: Page titles, section headers
  - Contrast: Optimized for dark backgrounds

- **`text-muted-foreground`** - Muted text
  - Example: Subtitles, helper text on dark backgrounds
  - Contrast: Reduced emphasis

### Background Colors
- **`bg-card`** - Card and container backgrounds
  - Use for: All card components, modal content areas
  
- **`bg-background`** - Page backgrounds
  - Use for: Page wrappers, main content areas

- **`bg-muted`** - Secondary backgrounds
  - Use for: Disabled states, less emphasized sections

- **`bg-primary`** - Primary action backgrounds
  - Use for: Primary buttons, key UI elements

### Border Colors
- **`border-border`** - Standard borders
  - Use for: Card borders, dividers, separators

- **`border-input`** - Form field borders
  - Use for: Input fields, textareas, selects

## Usage Rules

### ❌ FORBIDDEN Patterns
Never use these hardcoded color classes:

```tsx
// Text colors
text-gray-900
text-gray-800
text-gray-700
text-gray-600
text-gray-500
text-white
text-black

// Background colors
bg-white
bg-gray-100
bg-gray-200
bg-gray-50

// Border colors
border-gray-200
border-gray-300
border-white
```

### ✅ CORRECT Patterns
Always use semantic design tokens:

```tsx
// ❌ Wrong
<Card className="bg-white border-gray-200">
  <h2 className="text-gray-900">Title</h2>
  <p className="text-gray-600">Description</p>
</Card>

// ✅ Correct
<Card className="bg-card border-border">
  <h2 className="text-card-foreground">Title</h2>
  <p className="text-card-foreground/70">Description</p>
</Card>
```

## Component Patterns

### Page Structure
```tsx
<div className="min-h-screen bg-background p-4">
  <div className="max-w-4xl mx-auto space-y-6">
    {/* Page header with foreground for dark bg */}
    <h1 className="text-2xl font-bold text-foreground">
      Page Title
    </h1>
    
    {/* Cards use card-foreground for light bg */}
    <Card className="p-6 bg-card border-border">
      <h2 className="text-xl font-bold text-card-foreground">
        Card Title
      </h2>
      <p className="text-card-foreground/80">
        Card content with good readability
      </p>
    </Card>
  </div>
</div>
```

### Card Content
```tsx
<Card className="bg-card border-border shadow-md">
  {/* Title */}
  <h3 className="text-lg font-bold text-card-foreground mb-2">
    Title
  </h3>
  
  {/* Body text */}
  <p className="text-sm text-card-foreground/80 mb-3">
    Main description text
  </p>
  
  {/* Helper text */}
  <span className="text-sm text-card-foreground/70">
    Supporting information
  </span>
</Card>
```

### Form Fields
```tsx
<div>
  <Label className="text-card-foreground/70">Field Label</Label>
  <Input 
    className="border-input bg-background text-foreground"
    placeholder="Placeholder text"
  />
  <p className="text-card-foreground/60 text-sm mt-1">
    Helper text
  </p>
</div>
```

## Opacity Levels

Use consistent opacity levels for text hierarchy:

- **100% (no opacity)**: Primary content (titles, main text)
- **80%**: Secondary content (body text, descriptions)
- **70%**: Tertiary content (labels, metadata)
- **60%**: Quaternary content (placeholders, subtle hints)

## Dark Mode Considerations

The design system automatically adapts to dark mode through CSS variables defined in `index.css`. When using semantic tokens:

- `card-foreground` automatically switches between dark/light based on theme
- `foreground` adjusts for page-level backgrounds
- Never hardcode colors that won't adapt to theme changes

## Migration Checklist

When updating existing components:

1. [ ] Replace all `text-gray-*` with appropriate `card-foreground` variants
2. [ ] Replace `text-white` with `foreground` (on dark backgrounds)
3. [ ] Replace `bg-white` with `bg-card`
4. [ ] Replace `border-gray-*` with `border-border`
5. [ ] Test in both light and dark modes
6. [ ] Verify text contrast ratios meet WCAG AA standards

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com)
- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- Design System Variables: `src/index.css`
- Tailwind Config: `tailwind.config.ts`

## Support

For questions about design system usage, refer to this document or ask in code review.
