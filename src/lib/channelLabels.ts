export const CHANNEL_LABELS: Record<string, string> = {
  kan11: 'כאן 11',
  keshet12: 'קשת 12',
  reshet13: 'רשת 13',
  now14: 'עכשיו 14',
  i24: 'i24NEWS',
  knesset: 'ערוץ הכנסת',
  kan33: 'כאן 33',
  sport55: 'ספורט 5',
  sport56: 'ספורט 5+',
  gold: 'ספורט 5 GOLD',
  live: 'ספורט 5 LIVE',
  charlton1: "צ'רלטון 1",
  charlton2: "צ'רלטון 2",
  charlton3: "צ'רלטון 3",
  charlton4: "צ'רלטון 4",
  charlton6: "צ'רלטון 6",
};

export const CHANNEL_GROUP_LABELS: Record<string, string> = {
  main: 'ערוצים ראשיים',
  news: 'חדשות',
  public: 'ציבורי',
  sport: 'ספורט',
};

export function getChannelDisplayName(channelId: string, fallback?: string) {
  return CHANNEL_LABELS[channelId] || fallback || channelId;
}

export function getChannelGroupLabel(groupId: string, fallback?: string) {
  return CHANNEL_GROUP_LABELS[groupId] || fallback || groupId;
}
