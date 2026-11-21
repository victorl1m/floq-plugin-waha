/** Country calling codes offered in the phone picker, with how local numbers are grouped for display. */
export interface Country { code: string; name: string; flag: string; groups: number[]; paren?: boolean }
export const COUNTRIES: Country[] = [
  { code: "55", name: "Brazil", flag: "🇧🇷", groups: [2, 5, 4], paren: true },
  { code: "1", name: "United States / Canada", flag: "🇺🇸", groups: [3, 3, 4], paren: true },
  { code: "351", name: "Portugal", flag: "🇵🇹", groups: [3, 3, 3] },
  { code: "34", name: "Spain", flag: "🇪🇸", groups: [3, 3, 3] },
  { code: "52", name: "Mexico", flag: "🇲🇽", groups: [2, 4, 4] },
  { code: "54", name: "Argentina", flag: "🇦🇷", groups: [2, 4, 4] },
  { code: "56", name: "Chile", flag: "🇨🇱", groups: [1, 4, 4] },
  { code: "57", name: "Colombia", flag: "🇨🇴", groups: [3, 3, 4] },
  { code: "44", name: "United Kingdom", flag: "🇬🇧", groups: [4, 6] },
  { code: "49", name: "Germany", flag: "🇩🇪", groups: [3, 4, 4] },
  { code: "33", name: "France", flag: "🇫🇷", groups: [1, 2, 2, 2, 2] },
  { code: "39", name: "Italy", flag: "🇮🇹", groups: [3, 3, 4] },
  { code: "91", name: "India", flag: "🇮🇳", groups: [5, 5] },
];

/** Digits of an international number from anything a person types: "+55 (11) 99999-9999", "0055 11 ...", "5511999999999". Null when invalid. */
export function phoneDigits(raw: unknown, countryCode?: string): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || /[^0-9 +().\-]/.test(t)) return null;
  let digits = t.replace(/\D/g, "");
  if (t.startsWith("00")) digits = digits.slice(2);
  else if (!t.startsWith("+") && countryCode && !digits.startsWith(countryCode)) digits = countryCode + digits.replace(/^0+/, "");
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null;
}

export function countryOf(digits: string): Country | null {
  return [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => digits.startsWith(c.code)) ?? null;
}

/** Groups the local part for display: "+55 (11) 99999-9999", "+1 (555) 123-4567", "+351 912 345 678". Works on partial input too. */
export function formatLocal(local: string, country: Country | null): string {
  if (!country) return local.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  let rest = local, out: string[] = [];
  country.groups.forEach((n, i) => { if (!rest) return; const part = i === country.groups.length - 1 ? rest : rest.slice(0, n); rest = rest.slice(part.length); out.push(part); });
  if (rest) out.push(rest);
  if (country.paren && out.length) {
    const [area, ...tail] = out;
    const body = tail.length > 1 ? `${tail.slice(0, -1).join(" ")}-${tail[tail.length - 1]}` : tail.join("");
    return tail.length ? `(${area}) ${body}` : area.length === country.groups[0] ? `(${area})` : area;
  }
  return out.join(" ");
}

export function formatPhone(digits: string): string {
  const c = countryOf(digits);
  return c ? `+${c.code} ${formatLocal(digits.slice(c.code.length), c)}` : `+${digits}`;
}
