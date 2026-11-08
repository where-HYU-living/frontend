/** 집 주변 동네 월드(조각). campus-data 의 `neighborhoods/sites.json` 과 같은 id 규칙: 매물 'l<매물id>', 단지 'h<단지id>' */
export type SiteId = string;

/** 평면도가 있는 매물 7건(매물 id) — 동네 조각이 만들어져 있다 */
export const LISTING_SITES = [4, 6, 10, 17, 18, 19, 20] as const;
/** 청년안심주택 단지 5곳(단지 id) */
export const HOUSING_SITES = [1, 2, 3, 4, 5] as const;

export const siteForListing = (listingId: number): SiteId | null => ((LISTING_SITES as readonly number[]).includes(listingId) ? `l${listingId}` : null);
export const siteForHousing = (housingId: number): SiteId | null => ((HOUSING_SITES as readonly number[]).includes(housingId) ? `h${housingId}` : null);
export const neighborhoodUrl = (site: SiteId): string => `/neighborhoods/${site}.json`;
export const isSiteId = (v: string): boolean => /^[lh]\d+$/.test(v);

import sites from './neighborhoodSites.json';
export type SiteMeta = { id: SiteId; kind: 'listing' | 'housing'; ref: number; name: string; address: string; x: number; z: number; floorplanId: number | null };
export const SITES = sites as SiteMeta[];
export const siteMeta = (id: SiteId): SiteMeta | null => SITES.find((s) => s.id === id) ?? null;
