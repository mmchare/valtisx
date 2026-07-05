/**
 * Human-friendly greeting helpers for Valtis.
 *
 * We never say "Bonjour client" — always fall back to a capitalised email prefix
 * so the user sees something that looks like a name.
 */

export function friendlyFirstName(fullName?: string | null, email?: string | null): string {
  const name = (fullName ?? "").trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    return capitalize(first);
  }
  const local = (email ?? "").split("@")[0] ?? "";
  if (local) {
    // Turn "jean.dupont" or "jean_dupont-42" into "Jean"
    const cleaned = local.replace(/\d+$/g, "").split(/[._-]/).filter(Boolean)[0];
    if (cleaned) return capitalize(cleaned);
  }
  return "";
}

export function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Bonjour";
  if (h >= 12 && h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function greet(fullName?: string | null, email?: string | null): string {
  const first = friendlyFirstName(fullName, email);
  const prefix = timeGreeting();
  return first ? `${prefix}, ${first}` : prefix;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}