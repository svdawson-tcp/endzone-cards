import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  /* Base styles - optimized for mobile */
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
  {
    variants: {
      variant: {
        /* Primary action - Dallas Cowboys Navy */
        default: "bg-[#041E42] text-white shadow-md hover:bg-[#0A2E63] active:shadow-sm",
        
        /* Secondary action - Light gray background */
        secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400",
        
        /* Destructive action - Red */
        destructive: "bg-red-600 text-white shadow-md hover:bg-red-700 active:shadow-sm",
        
        /* Success action - Green */
        success: "bg-green-600 text-white shadow-md hover:bg-green-700 active:shadow-sm",
        
        /* Outline button - High contrast border */
        outline: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100",
        
        /* Ghost button - Minimal but visible */
        ghost: "text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200",
        
        /* Warning action - Amber */
        warning: "bg-amber-500 text-white shadow-md hover:bg-amber-600 active:shadow-sm",
        
        /* Link variant */
        link: "text-[#041E42] underline-offset-4 hover:underline",
      },
      size: {
        /* Mobile-optimized touch targets */
        default: "h-11 px-4 py-2 min-w-[88px]",
        sm: "h-9 px-3 text-xs min-w-[72px]",
        lg: "h-14 px-6 text-base min-w-[112px]",
        
        /* Icon buttons */
        icon: "h-11 w-11 p-0",
        "icon-sm": "h-9 w-9 p-0",
        "icon-lg": "h-14 w-14 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
