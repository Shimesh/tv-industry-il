export type AdminRole = 'admin' | 'moderator' | 'user';
export type AdminLoginMethod = 'google' | 'phone' | 'email';

export type AdminUserSummary = {
  uid: string;
  linkedUids: string[];
  uidCount: number;
  profileId: string | null;
  displayName: string;
  email: string;
  role: string;
  roles: string[];
  department: string;
  departments: string[];
  siteRole: AdminRole;
  isOnline: boolean;
  onlineNow: boolean;
  stalePresence: boolean;
  onboardingComplete: boolean;
  appTourSeen?: boolean;
  photoURL: string | null;
  city: string | null;
  lastSeen: string | null;
  crewName: string | null;
  is_consented: boolean;
  termsAccepted: boolean;
  termsAcceptedAt?: string | null;
  linkedContactId: number | string | null;
  phone: string | null;
  loginMethods: AdminLoginMethod[];
  hasPush: boolean;
  calendarEmploymentType: 'employee' | 'freelancer';
  calendarFullAccess: boolean;
};

export type CountBucket = {
  key: string;
  label: string;
  count: number;
};

export type SystemEventLevel = 'info' | 'success' | 'warn' | 'error';

export type SystemEventRecord = {
  id: string;
  type: string;
  level: SystemEventLevel;
  source: string;
  message: string;
  detail?: string | null;
  route?: string | null;
  job?: string | null;
  statusCode?: number | null;
  createdAt: string;
};

export type UsageMetric = {
  key: string;
  label: string;
  count: number;
  lastSeenAt: string | null;
};

export type PageViewEvent = {
  id: string;
  pathname: string;
  label: string;
  action: 'page_view';
  viewedAt: string;
  visitorId: string | null;
  authenticated: boolean;
  uid: string | null;
  displayName: string | null;
  email: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  browser: string | null;
  os: string | null;
  userAgent: string | null;
  deviceModel?: string | null;
  platformVersion?: string | null;
  browserVersions?: string | null;
  viewport?: string | null;
  screen?: string | null;
  devicePixelRatio?: number | null;
  colorGamut?: string | null;
  preferredColorScheme?: string | null;
  displayMode?: string | null;
  referrer: string | null;
};

export type RouteHealthMetric = {
  key: string;
  label: string;
  successCount: number;
  failureCount: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
};

export type JobStatusMetric = {
  key: string;
  label: string;
  runs: number;
  successRuns: number;
  failureRuns: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastStatus: 'running' | 'success' | 'failure' | null;
  lastError: string | null;
  lastMessage?: string | null;
  lastDetail?: string | null;
};

export type AdminOverviewStats = {
  totalUsers: number;
  onlineNow: number;
  active24h: number;
  admins: number;
  moderators: number;
  stalePresence: number;
  totalContacts: number;
  totalPosts: number;
  totalChats: number;
};

export type AppConfigSnapshot = {
  maintenanceMode: boolean;
  calendarForcePersonal: boolean;
  boardAnnouncement: string;
  ratingsAutomation: RatingsAutomationConfig;
  updatedAt: string | null;
};

export type RatingsAutomationConfig = {
  midrugEnabled: boolean;
  telegramEnabled: boolean;
  weeklyMode: 'sunday' | 'always';
  cronSchedule: string;
  cronTimezone: string;
};

export type AdminOverview = {
  generatedAt: string;
  presenceWindowMs: number;
  stats: AdminOverviewStats;
  appConfig: AppConfigSnapshot;
  contactsByDepartment: CountBucket[];
  contactsByWorkArea: CountBucket[];
  users: AdminUserSummary[];
  onlineUsers: AdminUserSummary[];
  staleUsers: AdminUserSummary[];
  recentEvents: SystemEventRecord[];
  usage: {
    topPages: UsageMetric[];
    routeHealth: RouteHealthMetric[];
    jobs: JobStatusMetric[];
  };
};

export type ContactDiscovery = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  sourceBoard: string;
  sourceBoardName: string | null;
  contactId: string;
  createdAt: string;
  discoveryDate: string;
};
