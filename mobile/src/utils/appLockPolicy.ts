export function isValidAppPin(pin: string) {
  return /^\d{4}$/.test(pin);
}
