export type ProductionRegistryEntry = {
  id: string;
  name: string;
  logoUrl: string;
  channel: string;
  description?: string;
  isMajor: boolean;
  isArchived?: boolean;
};

export type NearMiss = {
  productionName: string;
  date: string;
  crewSample: string[];
};

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
  dateFrom: string;
  dateTo: string;
  year: string;
  studio: string;
  role: string;
  channelId: string | null;
  channelName: string;
  isMajor: boolean;
  media: ProCardMedia;
  shiftCount: number;
  logoUrl?: string;
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
  nearMisses?: NearMiss[];
};
