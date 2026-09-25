// WebSocket Origin allow-list. Entries are exact origins
// (`https://example.com`) or patterns where `*` stands for one run of
// letters, digits and hyphens, e.g. Vercel previews:
// `https://tgt-td-cld-*-team.vercel.app`.

export type OriginCheck = (origin: string | undefined) => boolean;

export function parseAllowedOrigins(list: string): OriginCheck {
  const patterns = list
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter((s) => s.length > 0)
    .map((entry) => new RegExp(`^${entry.split('*').map(escapeRegExp).join('[a-z0-9-]+')}$`));
  return (origin) => {
    if (!origin) return false;
    const o = origin.trim().toLowerCase();
    return patterns.some((re) => re.test(o));
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
