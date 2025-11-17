import * as React from "react";
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-lg border bg-surface text-foreground shadow-sm transition-shadow",
  {
    variants: {
      variant: {
        /* Default card - Clean white */
        default: "border-border hover:shadow-md",
        
        /* Elevated card - More prominent */
        elevated: "border-border shadow-md hover:shadow-lg",
        
        /* Interactive card - Responds to touch */
        interactive: "border-border hover:shadow-md hover:bg-surface cursor-pointer active:scale-[0.99]",
        
        /* Success card - Profit/positive */
        success: "border-success/20 bg-success/5 hover:bg-success/10",
        
        /* Warning card - Needs attention */
        warning: "border-warning/20 bg-warning/5 hover:bg-warning/10",
        
        /* Primary accent card */
        primary: "border-primary/20 bg-primary/5 hover:bg-primary/10"
      },
      padding: {
        none: "p-0",
        sm: "p-3",
        default: "p-4",
        lg: "p-6"
      }
    },
    defaultVariants: {
      variant: "default",
      padding: "default"
    }
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, className }))}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
