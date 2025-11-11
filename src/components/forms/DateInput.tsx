import * as React from "react";
import { Input } from "@/components/ui/input";

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        type="date"
        className={`min-h-[44px] ${className || ""}`}
        ref={ref}
        {...props}
      />
    );
  }
);

DateInput.displayName = "DateInput";
