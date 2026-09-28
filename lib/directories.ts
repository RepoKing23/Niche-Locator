/**
 * Domains that are easy to outrank for a local service page: directories, lead-gen
 * marketplaces, job boards, social/UGC, big-box retail and generic how-to publishers.
 */
export const WEAK_DOMAINS = [
  // directories & lead-gen marketplaces
  "yelp.com", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "houzz.com",
  "bbb.org", "porch.com", "nextdoor.com", "yellowpages.com", "mapquest.com", "bark.com",
  "networx.com", "fixr.com", "homeguide.com", "buildzoom.com", "manta.com", "expertise.com",
  "threebestrated.com", "chamberofcommerce.com", "superpages.com", "craigslist.org",
  "homeyou.com", "modernize.com", "birdeye.com", "trustpilot.com", "brownbook.net",
  // job boards
  "indeed.com", "ziprecruiter.com", "glassdoor.com", "simplyhired.com", "monster.com",
  "salary.com", "careerbuilder.com", "linkedin.com",
  // social & UGC
  "facebook.com", "instagram.com", "youtube.com", "tiktok.com", "pinterest.com", "reddit.com",
  "quora.com", "x.com", "twitter.com",
  // big-box & generic publishers
  "lowes.com", "homedepot.com", "amazon.com", "wayfair.com", "wikipedia.org", "thespruce.com",
  "bobvila.com", "familyhandyman.com", "forbes.com", "thisoldhouse.com", "bhg.com",
];

export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

export function isWeakDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  return WEAK_DOMAINS.some((x) => d === x || d.endsWith(`.${x}`));
}
