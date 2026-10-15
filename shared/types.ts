// Shared Domain Types & Enums for BloodBridge

export type UserRole = 'DONOR' | 'REQUESTER' | 'HOSPITAL' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type AvailabilityStatus = 'AVAILABLE' | 'AVAILABLE_LATER' | 'NOT_AVAILABLE';

export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'CRITICAL';

export type RequestStatus =
  | 'PENDING_VERIFICATION'
  | 'HOSPITAL_VERIFIED'
  | 'MATCHING_IN_PROGRESS'
  | 'DONORS_NOTIFIED'
  | 'DONOR_CONFIRMED'
  | 'BLOOD_RECEIVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type MatchStatus = 'NOTIFIED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export type VerificationStatus = 'VERIFIED' | 'REJECTED' | 'INFO_REQUESTED';

export type NotificationCategory =
  | 'EMERGENCY_REQUEST'
  | 'DONOR_MATCH'
  | 'REQUEST_ACCEPTED'
  | 'VERIFICATION_UPDATE'
  | 'ESCALATION'
  | 'BLOOD_RECEIVED'
  | 'SYSTEM';

export interface UserPublicProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  status: UserStatus;
  createdAt: string;
}

export interface DonorProfileDto {
  id: string;
  userId: string;
  bloodGroup: BloodGroup;
  availabilityStatus: AvailabilityStatus;
  latitude: number;
  longitude: number;
  addressCity: string;
  lastDonationDate?: string | null;
  totalDonations: number;
  reliabilityScore: number;
  isAnonymous: boolean;
  user?: {
    fullName: string;
    email: string;
    phone?: string;
  };
}

export interface HospitalProfileDto {
  id: string;
  userId: string;
  hospitalName: string;
  licenseNumber: string;
  address: string;
  latitude: number;
  longitude: number;
  contactNumber: string;
  isVerified: boolean;
  totalVerifiedRequests: number;
}

export interface BloodRequestDto {
  id: string;
  requesterId: string;
  hospitalId: string;
  patientInitials: string;
  bloodGroup: BloodGroup;
  unitsRequired: number;
  urgency: UrgencyLevel;
  status: RequestStatus;
  requiredBy: string;
  notes?: string | null;
  latitude: number;
  longitude: number;
  isDuplicateFlagged: boolean;
  duplicateSimilarityScore: number;
  currentEscalationStage: number;
  createdAt: string;
  updatedAt: string;
  hospital?: {
    id: string;
    hospitalName: string;
    address: string;
    contactNumber: string;
  };
  requester?: {
    id: string;
    fullName: string;
    phone?: string;
  };
  matches?: DonorMatchDto[];
  statusHistory?: RequestStatusHistoryDto[];
  verificationRecords?: VerificationRecordDto[];
  escalationEvents?: EscalationEventDto[];
}

export interface DonorMatchDto {
  id: string;
  requestId: string;
  donorId: string;
  matchScore: number;
  distanceKm: number;
  status: MatchStatus;
  declineReason?: string | null;
  responseTimeSeconds?: number | null;
  notifiedAt: string;
  respondedAt?: string | null;
  donor?: {
    id: string;
    bloodGroup: BloodGroup;
    availabilityStatus: AvailabilityStatus;
    totalDonations: number;
    reliabilityScore: number;
    user?: {
      fullName: string;
    };
  };
}

export interface VerificationRecordDto {
  id: string;
  requestId: string;
  hospitalId: string;
  verifiedByUserId: string;
  status: VerificationStatus;
  reviewNotes?: string | null;
  verifiedAt: string;
  verifierName?: string;
}

export interface EscalationEventDto {
  id: string;
  requestId: string;
  stageNumber: number;
  radiusKm: number;
  donorsNotifiedCount: number;
  triggerReason: string;
  triggeredAt: string;
}

export interface RequestStatusHistoryDto {
  id: string;
  requestId: string;
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
  changedByUserId: string;
  reason?: string | null;
  timestamp: string;
}

export interface NotificationDto {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detailsJson?: string | null;
  ipAddress?: string | null;
  timestamp: string;
  userName?: string;
}

export interface PlatformMetrics {
  activeEmergencies: number;
  criticalEmergencies: number;
  availableDonors: number;
  registeredHospitals: number;
  pendingVerifications: number;
  completedRequests: number;
  matchSuccessRate: number;
  averageMatchingTimeMinutes: number;
  donorResponseRate: number;
  requestsByBloodGroup: Record<BloodGroup, number>;
}
