export enum UserRole {
  Rider = 'rider',
  Driver = 'driver',
  Business = 'business',
}

export enum PaymentMethodType {
  Venmo = 'Venmo',
  CashApp = 'Cash App',
  Zelle = 'Zelle',
  Card = 'Card',
}

export enum RideStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface OklahomaLocation {
  id: string;
  label: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export interface DriverDocument {
  id: 'license' | 'registration' | 'insurance' | 'ssn';
  title: string;
  fileName: string | null;
  uploadedAt: string | null;
  verified: boolean;
  expiryNote: string;
  expirationDate?: string;
  status?: 'active' | 'expired';
}

export interface VehicleDetails {
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
}

export interface SupportChatMessage {
  id: string;
  sender: 'driver' | 'rider' | 'support';
  category: string;
  text: string;
  timestamp: string;
}

export interface UserAccount {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  email: string;
  password: string;
  createdAt: string;
  // Rider fields
  homeAddress?: string;
  workAddress?: string;
  paymentMethod?: PaymentMethodType;
  paymentHandle?: string;
  // Driver fields
  driverApprovalStatus?: 'pending' | 'approved';
  vehicle?: VehicleDetails;
  documents?: DriverDocument[];
  isOnline?: boolean;
  driverRating?: number;
  cashedOutTotal?: number;
  supportMessages?: SupportChatMessage[];
  // Business fields
  businessName?: string;
  businessDistrict?: string;
  businessCategory?: string;
  businessAddress?: string;
}

export interface ChatMessage {
  id: string;
  senderRole: UserRole.Rider | UserRole.Driver;
  senderName: string;
  text: string;
  timestamp: string;
}

export interface SafetyReport {
  id: string;
  category: string;
  details: string;
  submittedBy: string;
  submittedByRole?: 'rider' | 'driver';
  submittedAt: string;
  incidentTags?: string[];
  driverResponse?: string;
  driverEvidenceNote?: string;
  driverAttachmentName?: string;
  resolutionOffer?: string;
  respondedAt?: string;
  status:
    | 'Queued for Co-op Human Safety Panel'
    | 'Driver Response Submitted • Peer Co-op Review'
    | 'Resolved with Co-op Desk';
}

export interface FareBreakdown {
  miles: number;
  holdFee: number;
  mileageCharge: number;
  totalFare: number;
  driverPayout70: number;
  charityShare5: number;
  operationsShare25: number;
}

export type ActiveTripStage =
  | 'en_route_pickup'
  | 'arrived_pickup'
  | 'en_route_stop1'
  | 'arrived_stop1'
  | 'in_progress'
  | 'completed';

export interface RideReservation {
  id: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  riderScore?: number;
  pickupAddress: string;
  pickupCoords: GeoPoint;
  stop1Address?: string;
  stop1Coords?: GeoPoint;
  dropoffAddress: string;
  dropoffCoords: GeoPoint;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "06:30 PM"
  scheduledTimestamp: number;
  status: RideStatus;
  tripStage?: ActiveTripStage;
  arrivedAtPickupTimestamp?: number;
  arrivedAtStop1Timestamp?: number;
  tripStartedTimestamp?: number;
  completedTimestamp?: number;
  pickupExtraWaitActive?: boolean;
  pickupExtraWaitStartedAt?: number;
  stop1ExtraWaitActive?: boolean;
  stop1ExtraWaitStartedAt?: number;
  extraWaitFeeCharged?: number;
  noShowClaimed?: boolean;
  endedAtStop1Claimed50?: boolean;
  fare: FareBreakdown;
  tipAmount?: number;
  durationMinutes?: number;
  bookingMode?: 'instant' | 'reserve';
  driverQueueIndex?: number;
  driverDistanceToPickupMiles?: number;
  lostFoundFeeClaimed?: number;
  lostFoundItemDescription?: string;
  lostFoundClaimedAt?: string;
  lostFoundRiderRequested?: boolean;
  lostFoundRiderItemDescription?: string;
  lostFoundRiderFeeAgreed?: boolean;
  lostFoundRiderRequestedAt?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverVehicle?: string;
  driverCoords?: GeoPoint;
  declinedByDriverIds: string[];
  chatMessages: ChatMessage[];
  riderRating?: number;
  riderReviewNote?: string;
  riderRatingByDriver?: number;
  safetyReports: SafetyReport[];
  cancellationNote?: string;
  refundedHoldFee?: boolean;
  createdAt: string;
}

export interface BusinessPerk {
  id: string;
  businessId: string;
  businessName: string;
  district: string;
  headline: string;
  description: string;
  promoCode: string;
  active: boolean;
  claimsCount: number;
  createdAt: string;
}

export interface AppState {
  accounts: UserAccount[];
  currentUserId: string | null;
  reservations: RideReservation[];
  perks: BusinessPerk[];
}
