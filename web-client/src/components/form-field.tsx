import { type ComponentPropsWithoutRef, type ReactNode, useId } from "react";

type FormFieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
};

export function FormField({ label, hint, error, id, className = "", ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={`form-field ${className}`.trim()}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-invalid={Boolean(error)} aria-describedby={descriptionId} {...inputProps} />
      {error ? (
        <p className="field-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
