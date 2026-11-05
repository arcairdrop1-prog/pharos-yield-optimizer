export function pow10(decimals) { return 10n ** BigInt(decimals); }
export function ceilDiv(a, b) { if (b <= 0n) throw new Error("Invalid denominator."); return (a + b - 1n) / b; }
export function decodeUint(hex, label = "uint256") { if (!/^0x[0-9a-f]+$/i.test(hex || "")) throw new Error(`Invalid ${label}.`); return BigInt(hex); }
export function decodeAddress(hex, label = "address") { if (!/^0x[0-9a-f]{64}$/i.test(hex || "")) throw new Error(`Invalid ${label}.`); return `0x${hex.slice(-40).toLowerCase()}`; }
export function encodeUintCall(selector, value) { return `${selector}${BigInt(value).toString(16).padStart(64, "0")}`; }
export function parseUnits(value, decimals) {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid non-negative amount: ${value}`);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Too many decimal places; maximum is ${decimals}.`);
  return BigInt(whole) * pow10(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
}
export function formatUnits(value, decimals, precision = decimals) {
  const n = BigInt(value); const neg = n < 0n; const abs = neg ? -n : n; const base = pow10(decimals);
  const whole = abs / base; const frac = (abs % base).toString().padStart(decimals, "0").slice(0, precision).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
export function mulDivDown(a, b, d) { return BigInt(a) * BigInt(b) / BigInt(d); }
export function mulDivUp(a, b, d) { return ceilDiv(BigInt(a) * BigInt(b), BigInt(d)); }
export function codeBytes(code) { return code === "0x" ? 0 : (code.length - 2) / 2; }
