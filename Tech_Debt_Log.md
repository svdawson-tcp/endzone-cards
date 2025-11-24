# Technical Debt Log

## Purpose
Track known technical debt, architectural issues, and system improvements needed across the EndZone application.

## Open Items

| ID | Session | Description | Priority | Owner | Date Identified | Status |
|----|---------|-------------|----------|-------|-----------------|--------|
| TD-008 | Session 11/24 | Page Layout Architecture - Header scroll overlap due to hybrid fixed/flex positioning | High | Lovable | 2025-11-24 | Resolved |

## Resolved Items Detail

### TD-008: Page Layout Architecture (Resolved 2025-11-24)
**Issue:** Content scrolled behind fixed header on multiple pages (Dashboard, Lots, Disposition, others). Multiple fix attempts adjusting padding values failed.

**Root Cause:** Hybrid positioning approach — TopBar used `fixed top-0` while AuthenticatedLayout used `h-screen overflow-hidden` flex container. This created padding coordination problems where `pt-24/pt-32` on main had to exactly match header height, and any mismatch caused overlap.

**Solution Implemented:** Pure flexbox layout removing all fixed positioning:

1. **TopBar.tsx** - Removed `fixed top-0 left-0 right-0`, header now flows naturally as first flex child
2. **DesktopSidebar.tsx** - Removed `fixed`, changed to `flex-shrink-0` in horizontal flex layout
3. **AuthenticatedLayout.tsx** - Restructured to proper flex hierarchy:
   - Outer: `h-screen overflow-hidden flex flex-col`
   - Content row: `flex flex-1 overflow-hidden`
   - Sidebar: `flex-shrink-0` (desktop only)
   - Main: `flex-1 overflow-y-auto` (no padding-top needed)
4. **MentorModeBanner.tsx** - Removed `sticky top-20`, flows naturally after header

**Why This Works:** Header sits in document flow above the scroll container. Content cannot scroll behind it because they occupy separate areas of the flex layout — no padding coordination required.

**Files Modified:**
- `src/components/Navigation/TopBar.tsx`
- `src/components/Navigation/DesktopSidebar.tsx`
- `src/components/Layout/AuthenticatedLayout.tsx`
- `src/components/MentorModeBanner.tsx`

**Evidence:** Session EZ-019 screenshots confirming header stays fixed on Dashboard, Lots, and Disposition pages.

**Related AD:** AD-007 (Pure Flexbox Page Layout Architecture)
