// Trusted-source allowlist for the doctor Research Assistant. Edit this file
// only — the search and the post-search hostname filter both read from it.
// A domain matches itself and any subdomain (so "nhs.uk" covers
// www.nhs.uk). `region` drives the India/Global filter on the results page.

export const INDIA_SOURCES = [
  { domain: 'icmr.gov.in', label: 'ICMR', region: 'india' },
  { domain: 'mohfw.gov.in', label: 'MoHFW', region: 'india' },
  { domain: 'cdsco.gov.in', label: 'CDSCO', region: 'india' },
  { domain: 'nhp.gov.in', label: 'National Health Portal', region: 'india' },
];

export const GLOBAL_SOURCES = [
  { domain: 'who.int', label: 'WHO', region: 'global' },
  { domain: 'cdc.gov', label: 'CDC', region: 'global' },
  { domain: 'nih.gov', label: 'NIH', region: 'global' },
  { domain: 'medlineplus.gov', label: 'MedlinePlus', region: 'global' },
  { domain: 'fda.gov', label: 'FDA', region: 'global' },
  { domain: 'nhs.uk', label: 'NHS', region: 'global' },
  { domain: 'nice.org.uk', label: 'NICE', region: 'global' },
];

// Returns the matching source entry for a URL, or null if the URL's host is
// not on the given list. Used to re-check TinyFish's results ourselves
// rather than trusting its include_domains filter alone.
export function matchSource(url, sources) {
  let host;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    sources.find((s) => host === s.domain || host.endsWith(`.${s.domain}`)) || null
  );
}
