// ============================================
// Mobile App Type Definitions
// ============================================

export type UserRole = "SMOKER" | "FAMILY" | "ADMIN";
export type BadgeCategory = "STREAK" | "HEALTH" | "QUIZ" | "MILESTONE";

export interface UserProfile {
  id: string;
  displayId?: string;
  phoneNumber: string;
  role: UserRole;
  displayName: string;
  smokingType?: "CIGARETTE" | "POD";
  cigarettesPerDay: number | null;
  pricePerPack: number | null;
  cigarettesPerPack: number;
  quitDate: string | null;
  followedSmokers?: { id: string; displayName?: string; phoneNumber?: string }[];
  emergencyContact?: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  surveyResponse?: any;
}

export interface DailyLog {
  id: string;
  userId: string;
  logDate: string;
  cigarettesSmoked: number;
  cravingCount: number;
  mood: string | null;
  notes: string | null;
  articlesRead: number;
  gamesPlayed: number;
  soundsListened: number;
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

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface HealthMilestone {
  hours: number;
  title: string;
  description: string;
  icon: string;
  achieved: boolean;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  isActiveToday: boolean;
}
