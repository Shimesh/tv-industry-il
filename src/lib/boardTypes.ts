export type ListingType =
  | 'job_offer'         // הצעת עבודה
  | 'job_search'        // מחפש/ת עבודה
  | 'equipment_sale'    // ציוד למכירה
  | 'equipment_free'    // ציוד למסירה
  | 'equipment_rental'  // ציוד להשכרה
  | 'service'           // שירות מקצועי
  | 'space'             // חלל / אולפן
  | 'wanted'            // דרוש/ה
  | 'other';            // אחר

export type PriceUnit = 'per_day' | 'per_hour' | 'per_project' | 'fixed' | 'negotiable' | 'free';
export type ListingStatus = 'active' | 'closed';

export interface BoardListing {
  id: string;
  type: ListingType;
  title: string;
  description: string;
  authorUid: string;
  authorName: string;
  authorAvatar?: string;
  contactPhone?: string;
  contactEmail?: string;
  price?: number;
  priceMax?: number;
  priceUnit?: PriceUnit;
  mediaUrls?: string[];
  tags?: string[];
  location?: string;
  department?: string;
  isHot?: boolean;
  isUrgent?: boolean;
  viewCount?: number;
  contactCount?: number;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export const LISTING_TYPE_CONFIG: Record<ListingType, { label: string; color: string; bg: string; border: string }> = {
  job_offer:        { label: 'הצעת עבודה',     color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.25)' },
  job_search:       { label: 'מחפש/ת עבודה',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)' },
  equipment_sale:   { label: 'ציוד למכירה',     color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.25)' },
  equipment_free:   { label: 'ציוד למסירה',     color: '#c084fc', bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.25)' },
  equipment_rental: { label: 'ציוד להשכרה',    color: '#facc15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.25)' },
  service:          { label: 'שירות מקצועי',   color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', border: 'rgba(34,211,238,0.25)' },
  space:            { label: 'חלל / אולפן',     color: '#f472b6', bg: 'rgba(244,114,182,0.12)', border: 'rgba(244,114,182,0.25)' },
  wanted:           { label: 'דרוש/ה',          color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)' },
  other:            { label: 'אחר',             color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)' },
};

export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  per_day:     '₪ ליום',
  per_hour:    '₪ לשעה',
  per_project: '₪ לפרויקט',
  fixed:       '₪',
  negotiable:  'לפי סיכום',
  free:        'חינם',
};

export function formatPrice(price?: number, priceMax?: number, priceUnit?: PriceUnit): string {
  if (!price && priceUnit !== 'free' && priceUnit !== 'negotiable') return '';
  if (priceUnit === 'free') return 'חינם';
  if (priceUnit === 'negotiable') return 'לפי סיכום';
  const label = priceUnit ? PRICE_UNIT_LABELS[priceUnit] : '₪';
  if (price && priceMax && priceMax > price) {
    return `${price.toLocaleString()}–${priceMax.toLocaleString()} ${label}`;
  }
  return `${(price ?? 0).toLocaleString()} ${label}`;
}
