# Architectural Decision Log

## Purpose
Document significant architectural decisions made during EndZone application development.

## Decision Summary

| ID | Date | Title | Decision | Alternative Considered | Impact | Status | Session |
|----|------|-------|----------|----------------------|--------|--------|---------|
| AD-007 | 2025-11-24 | Pure Flexbox Page Layout Architecture | Replaced hybrid fixed/flex positioning with pure flexbox layout for predictable scroll behavior | Fixed header with padding offsets | High | Active | Session EZ-019 |

## Decision Details

### AD-007: Pure Flexbox Page Layout Architecture
**Context:** Recurring header scroll overlap issues (TD-008) despite multiple fix attempts. Root cause was hybrid positioning — fixed header requiring padding coordination with flex scroll container.

**Decision:** Adopt pure flexbox layout where all major layout elements (header, sidebar, content) participate in document flow rather than using fixed positioning.

**Layout Structure:**
```
AuthenticatedLayout
├── h-screen overflow-hidden flex flex-col (viewport lock)
    ├── TopBar (natural flow, no fixed)
    ├── MentorModeBanner (natural flow, no sticky)
    ├── div.flex.flex-1.overflow-hidden (horizontal container)
    │   ├── DesktopSidebar (flex-shrink-0, md:flex)
    │   └── main.flex-1.overflow-y-auto (scroll container)
    └── BottomTabBar (natural flow)
```

**Rationale:**
- Eliminates padding coordination issues
- Header cannot be overlapped because it's outside scroll container
- Predictable behavior across all viewports
- Sidebar participates in same flex layout
- Simpler mental model for future developers

**Alternatives Considered:**
1. **Fixed header with coordinated padding** (rejected) - Required exact height matching, fragile across breakpoints
2. **Sticky positioning** (rejected) - Still requires scroll container management
3. **Absolute positioning** (rejected) - Similar coordination issues as fixed

**Trade-offs:**
- **Pro:** Eliminates entire class of layout bugs
- **Pro:** No magic numbers for padding offsets
- **Pro:** Works consistently across all pages
- **Con:** Header scrolls with page on mobile (acceptable, common pattern)

**Impact:**
- High - Affects all authenticated pages
- Resolves TD-008 permanently
- Sets standard pattern for future layout work

**Implementation Date:** 2025-11-24

**Related Issues:** TD-008 (Page Layout Architecture)
