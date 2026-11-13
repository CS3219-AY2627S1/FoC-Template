/**
 * Client-side copies of User Service's input rules, so forms can explain a
 * problem before submitting. User Service still validates every request.
 */

export const STUDENT_NUMBER_PATTERN = /^[AU][0-9]{7}[A-Z]$/i;
export const DISPLAY_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

export function validateStudentNumber(value: string) {
  return STUDENT_NUMBER_PATTERN.test(value.trim())
    ? undefined
    : 'Use the format A1234567B.';
}

export function validateDisplayName(value: string) {
  const name = value.trim();
  if (!name) return 'Enter your name.';
  if (name.length > 100) return 'Use 100 characters or fewer.';
  return DISPLAY_NAME_PATTERN.test(name)
    ? undefined
    : 'Use English letters, with single spaces between words.';
}

export function validatePassword(value: string) {
  if (value.length < 8 || value.length > 100) {
    return 'Use 8 to 100 characters.';
  }
  return /[A-Za-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
    ? undefined
    : 'Include a letter, a number and a special character.';
}
