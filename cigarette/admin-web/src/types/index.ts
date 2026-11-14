// ============================================
// Database Model Types (mirrors Prisma schema)
// ============================================

export type UserRole = "SMOKER" | "FAMILY" | "ADMIN" | "EXPLORER";
export type BadgeCategory = "STREAK" | "HEALTH" | "QUIZ" | "MILESTONE";

export interface UserProfile {
  id: string;
  displayId: string;
  phoneNumber: string;
  role: UserRole;
  displayName: string;
  smokingType?: "CIGARETTE" | "POD";
  cigarettesPerDay: number | null;
  pricePerPack: number | null;
  cigarettesPerPack: number;
  quitDate: string | null;
  followedSmokers?: { id: string; displayName?: string; phoneNumber?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyLog {
  id: string;
  userId: string;
  logDate: string;
  cigarettesSmoked: number;
  cravingCount: number;
  mood: string | null;
  notes: string | null;
  articlesRead?: number;
  gamesPlayed?: number;
  soundsListened?: number;
  createdAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  category: BadgeCategory;
  criteriaDays: number | null;
  criteriaValue: number | null;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  badge: Badge;
  earnedAt: string;
}

// ============================================
// Analytics / KPI Types
// ============================================

export interface KPIData {
  totalActiveUsers: number;
  totalCigarettesAvoided: number;
  totalMoneySaved: number;
  averageReductionPercent: number;
}

export interface SuccessRateData {
  period: string;
  days: number;
  successRate: number;
  totalUsers: number;
  successfulUsers: number;
}

export interface DailyTrendPoint {
  date: string;
  cigarettesAvoided: number;
  moneySaved: number;
  activeUsers: number;
}

export interface AnonymizedUserRow {
  anonymousId: string;
  joinedDaysAgo: number;
  baselineCigsPerDay: number;
  currentAvgCigsPerDay: number;
  reductionPercent: number;
  currentStreak: number;
  totalMoneySaved: number;
  status: "improving" | "stable" | "struggling";
}

// ============================================
// API Types
// ============================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LoginRequest {
  phoneNumber: string;
  password?: string;
}

export interface RegisterRequest {
  phoneNumber: string;
  password?: string;
  displayName: string;
  role?: UserRole;
  cigarettesPerDay?: number;
  pricePerPack?: number;
  cigarettesPerPack?: number;
}

export interface LogRequest {
  cigarettesSmoked: number;
  cravingCount?: number;
  mood?: string;
  notes?: string;
}

export interface AuthResponse {
  token: string;
  user: Omit<UserProfile, "passwordHash">;
}

// ============================================
// Component Props
// ============================================

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  gradient: string;
}

export interface ImpactAnalyticsProps {
  kpis: KPIData;
  dailyTrends: DailyTrendPoint[];
  successRates: SuccessRateData[];
}
