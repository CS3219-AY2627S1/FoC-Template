import { useId } from "react";

export const passwordHintText = "At least 12 characters from 3 of the 4 character groups";

export function PasswordRequirements({ children }: { children: string }) {
  const tooltipId = useId();

  return (
    <span aria-describedby={tooltipId} className="password-requirements" tabIndex={0}>
      {children}
      <span className="password-requirements-tooltip" id={tooltipId} role="tooltip">
        <span>Uppercase letters (A–Z)</span>
        <span>Lowercase letters (a–z)</span>
        <span>Digits (0–9)</span>
        <span>Special characters (!, #, $, %, ^, &, *, (, ), -, _, =, +,?,.)</span>
      </span>
    </span>
  );
}
