export type LanguagePreference = 'en-IN' | 'bn-IN';

export type KolkataZoneId = 'all' | 'salt-lake' | 'central' | 'new-town' | 'south' | 'north';

export interface TrustCategoryScore {
  label: string;
  percentage: number;
}

export interface KitchenOutlet {
  key: 'arsalan' | 'peter-cat' | 'mocambo' | 'balaram';
  name: string;
  fullName: string;
  locality: string;
  etaMinutes: string;
  cuisines: string;
  rating: string;
  reviewCount: string;
  score: number;
  auditedMonth: string;
  auditDate: string;
  fssai: string;
  isPureVeg: boolean;
  zones: readonly Exclude<KolkataZoneId, 'all'>[];
  searchText: string;
  imageUrl: string;
  categoryPercentages: readonly [number, number, number, number, number];
}

export type AuthPanelName = 'login' | 'otp' | 'register' | 'recover';

export interface UserProfileView {
  id: string;
  name: string;
  emailMasked?: string | null;
  phoneMasked?: string | null;
  roles: string[];
  activeRole: string;
  status: string;
  languagePreference: LanguagePreference;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthSessionSummaryView {
  sessionId: string;
  deviceName: string;
  createdAt: string;
  lastRotatedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthTokensView {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export interface AuthSessionState {
  user: UserProfileView;
  tokens: AuthTokensView;
  session: AuthSessionSummaryView;
}
