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
        /* Primary action - Cowboys accent gold */
        default: "bg-accent text-accent-foreground shadow-md hover:bg-accent/90 active:shadow-sm",
        
        /* Secondary action - Navy outline */
        secondary: "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 active:bg-primary/20",
        
        /* Destructive action - Universal red */
        destructive: "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 active:shadow-sm",
        
        /* Success action - Universal green */
        success: "bg-success text-success-foreground shadow-md hover:bg-success/90 active:shadow-sm",
        
        /* Outline button - High contrast border */
        outline: "border border-border bg-surface text-foreground hover:bg-muted hover:text-foreground active:bg-muted/80",
        
        /* Ghost button - Minimal but visible */
        ghost: "text-foreground hover:bg-muted hover:text-foreground active:bg-muted/80",
        
        /* Warning action - Universal amber */
        warning: "bg-warning text-warning-foreground shadow-md hover:bg-warning/90 active:shadow-sm",
        
        /* Link variant */
        link: "text-primary underline-offset-4 hover:underline",
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
