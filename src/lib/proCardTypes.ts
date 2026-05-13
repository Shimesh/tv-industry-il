export type ProCardMedia = {
  kind: 'production' | 'channel' | 'fallback';
  label: string;
  shortLabel: string;
  color: string;
  gradient: string;
  imageUrl?: string;
};

export type ProCardProductionCredit = {
  id: string;
  productionName: string;
  date: string;
  year: string;
  studio: string;
  role: string;
  channelId: string | null;
  channelName: string;
  isMajor: boolean;
  media: ProCardMedia;
};

export type ProCardBoardActivity = {
  id: string;
  title: string;
  type: string;
  date: string;
  year: string;
  category: string;
};

export type ProCardHistoryResponse = {
  productionCredits: ProCardProductionCredit[];
  boardActivity: ProCardBoardActivity[];
};
