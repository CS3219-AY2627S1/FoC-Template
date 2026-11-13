/** Response from credit estimation. */
export type EstimateCreditResponse = {
  minCredits: number
  maxCredits: number
  reason: string
}
