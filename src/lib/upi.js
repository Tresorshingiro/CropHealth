// province / district / sector / cell / parcel number, e.g. 5/05/10/02/1939
const UPI_PATTERN = /^\d\/\d{2}\/\d{2}\/\d{2}\/\d+$/

export const UPI_FORMAT_MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'

/**
 * The cleaned UPI, or null when the input is not one. Everything that reaches
 * a query passes through here, so only digits and slashes ever do.
 */
export function parseUpi(input) {
  if (typeof input !== 'string') return null
  const upi = input.replace(/\s+/g, '')
  return UPI_PATTERN.test(upi) ? upi : null
}
