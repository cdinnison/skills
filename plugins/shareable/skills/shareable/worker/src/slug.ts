const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_LEN = 14;

export function mintSlug(): string {
  const bytes = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]{14}$/.test(s);
}

export function shortId(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
