export type RatingsMode = 'daily' | 'weekly';

export type RatingRow = {
  rank: number;
  showName: string;
  channel: string;
  date: string;
  duration: number;
  ratingPercent: number;
  masterEntryId?: string;
  canonicalShowName?: string;
  logoUrl?: string;
  channelTags?: string[];
};

export type RatingsDailyDocument = {
  id?: string;
  date: string;
  targetAudience: string;
  top20: RatingRow[];
  fetchedAt: string;
  sourceDate?: string;
  fallbackUsed?: boolean;
};

export type RatingsWeeklyDocument = {
  id?: string;
  weekRange: string;
  weekId?: string;
  targetAudience?: string;
  top25: RatingRow[];
  fetchedAt: string;
};

export type RatingsApiResponse = {
  success: boolean;
  type?: RatingsMode | 'all';
  daily?: RatingsDailyDocument | null;
  weekly?: RatingsWeeklyDocument | null;
  error?: string;
};

