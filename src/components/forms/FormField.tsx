import * as React from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  htmlFor: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  error,
  helperText,
  htmlFor,
  children,
}) => {
  return (
    <div>
      <label htmlFor={htmlFor} className="form-label">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="mt-2">{children}</div>
      {helperText && (
        <p className="text-xs text-gray-400 mt-1">{helperText}</p>
      )}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
};
