// IMPORTANT: BACKEND MUST ENSURE THESE REQUIREMENTS.
// FOR USER CONVENIENCE ONLY.

export const passwordRequirements = [
  'At least 8 characters',
  'One lowercase letter',
  'One uppercase letter',
  'One number',
  'One special character (!@#$%^&*)',
]

export function isNusEmail(email: string) {
  return /^[^\s@]+@(u\.nus\.edu|nus\.edu\.sg)$/i.test(email)
}

export function passwordErrors(password: string) {
  const errors: string[] = []
  if (password.length < 8) errors.push(passwordRequirements[0])
  if (!/[a-z]/.test(password)) errors.push(passwordRequirements[1])
  if (!/[A-Z]/.test(password)) errors.push(passwordRequirements[2])
  if (!/[0-9]/.test(password)) errors.push(passwordRequirements[3])
  if (!/[!@#$%^&*]/.test(password)) errors.push(passwordRequirements[4])
  return errors
}

export function usernameError(username: string) {
  if (!/^[a-zA-Z0-9]{3,50}$/.test(username)) {
    return 'Use 3–50 alphanumeric characters.'
  }
  return ''
}

export function imageFileError(file: File | null) {
  if (!file) return ''
  const extension = file.name.toLowerCase().split('.').pop()
  if (
    !['jpg', 'png'].includes(extension ?? '') ||
    !['image/jpeg', 'image/png'].includes(file.type)
  ) {
    return 'Choose a JPG or PNG image.'
  }
  if (file.size >= 5 * 1024 * 1024) return 'The image must be smaller than 5 MB.'
  return ''
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Unable to read the image.'))
    reader.readAsDataURL(file)
  })
}
