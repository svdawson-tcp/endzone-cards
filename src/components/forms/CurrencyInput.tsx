import * as React from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ step = "0.01", className, ...props }, ref) => {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          type="text"
          inputMode="decimal"
          pattern="^\d*\.?\d{0,2}$"
          step={step}
          className={`pl-8 min-h-[44px] ${className || ""}`}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
