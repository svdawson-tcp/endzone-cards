/**
 * TEST FILE: Design System Violation Detection
 * 
 * This file contains intentional violations to verify ESLint rules work.
 * Run: npm run lint
 * 
 * Expected: 7 errors blocking these violations:
 */

import { Button } from "@/components/ui/button";

// ❌ VIOLATION 1: text-gray-* should error
export const BadComponent1 = () => {
  return <div className="text-gray-900">Bad text color</div>;
};

// ❌ VIOLATION 2: bg-gray-* should error
export const BadComponent2 = () => {
  return <div className="bg-gray-100">Bad background</div>;
};

// ❌ VIOLATION 3: border-gray-* should error
export const BadComponent3 = () => {
  return <div className="border border-gray-300">Bad border</div>;
};

// ❌ VIOLATION 4: text-white should error
export const BadComponent4 = () => {
  return <div className="text-white">Bad white text</div>;
};

// ❌ VIOLATION 5: text-black should error
export const BadComponent5 = () => {
  return <div className="text-black">Bad black text</div>;
};

// ❌ VIOLATION 6: bg-white should error
export const BadComponent6 = () => {
  return <div className="bg-white">Bad white background</div>;
};

// ❌ VIOLATION 7: bg-black should error
export const BadComponent7 = () => {
  return <div className="bg-black">Bad black background</div>;
};

// ✅ CORRECT: These should pass without errors
export const GoodComponent = () => {
  return (
    <div className="bg-card text-card-foreground border border-border">
      <h2 className="text-foreground">Proper design system usage</h2>
      <p className="text-card-foreground/80">Using semantic tokens</p>
      <div className="bg-muted text-muted-foreground">Muted section</div>
      <Button>Properly styled button</Button>
    </div>
  );
};
