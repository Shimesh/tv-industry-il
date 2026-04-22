export type AdminRole = 'admin' | 'moderator' | 'user';

export type AdminUserSummary = {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  department: string;
  siteRole: AdminRole;
  isOnline: boolean;
  onlineNow: boolean;
  stalePresence: boolean;
  onboardingComplete: boolean;
  photoURL: string | null;
  city: string | null;
  lastSeen: string | null;
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
  lastStatus: 'success' | 'failure' | null;
  lastError: string | null;
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
  boardAnnouncement: string;
  updatedAt: string | null;
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
