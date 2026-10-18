/** Which application a session belongs to. Sessions are never shared between apps. */
export const AUTH_CLIENTS = ['web', 'passenger', 'transport'] as const;
export type AuthClient = (typeof AUTH_CLIENTS)[number];

export const OTP_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

/** `login` signs in (creating the account if needed); `verify_contact` confirms a contact of the signed-in user. */
export const OTP_PURPOSES = ['login', 'verify_contact'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export type UserStatus = 'active' | 'suspended';

export interface UserProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** E.164, e.g. `+584121234567`. */
  phone: string | null;
  phoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  /** True once a platform reviewer approved the user's KYC application. */
  identityVerified: boolean;
  /** Platform staff role (`admin`, `reviewer`), or null for regular users. */
  platformRole: 'admin' | 'reviewer' | null;
  createdAt: string;
}

/** Opaque bearer tokens. Store the refresh token in secure storage (Keychain/Keystore, httpOnly cookie). */
export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

/** `POST /api/v1/auth/register` */
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  client: AuthClient;
}

/** `POST /api/v1/auth/login` */
export interface PasswordLoginRequest {
  email: string;
  password: string;
  client: AuthClient;
}

/**
 * `POST /api/v1/auth/otp/request` (sign in with a code) and
 * `POST /api/v1/me/contact-verification/request` (verify a contact of the signed-in user).
 * `destination` is a phone number for sms/whatsapp, or an e-mail for the email channel.
 */
export interface OtpRequest {
  channel: OtpChannel;
  destination: string;
}

export interface OtpChallengeResponse {
  challengeId: string;
  channel: OtpChannel;
  /** Masked destination for display, e.g. `+58 *** ***4567`. */
  destinationHint: string;
  expiresAt: string;
  /** Earliest time another code may be requested for the same destination. */
  resendAvailableAt: string;
}

/** `POST /api/v1/auth/otp/verify` — signs in, creating a passenger account on first use. */
export interface OtpVerifyRequest {
  challengeId: string;
  code: string;
  client: AuthClient;
}

/** `POST /api/v1/me/contact-verification/confirm` */
export interface ContactVerificationConfirmRequest {
  challengeId: string;
  code: string;
}

/** `POST /api/v1/auth/refresh` */
export interface RefreshRequest {
  refreshToken: string;
}

/** `PATCH /api/v1/me` */
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
}
