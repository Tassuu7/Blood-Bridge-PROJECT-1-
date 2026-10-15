/**
 * BloodBridge Request Cancellation & Resolution Service
 * Manages controlled cancellation lifecycle, structured cancellation taxonomy,
 * donor stand-down notification generation, and audit logging.
 */

export type CancellationReason =
  | 'FOUND_DONOR_EXTERNAL'
  | 'PATIENT_DISCHARGED'
  | 'SURGERY_POSTPONED'
  | 'HOSPITAL_STOCK_FULFILLED'
  | 'REQUEST_EXPIRED'
  | 'ENTERED_IN_ERROR'
  | 'OTHER';

export interface CancellationRecord {
  requestId: string;
  cancelledByUserId: string;
  cancelledByRole: string;
  reason: CancellationReason;
  notes?: string;
  cancelledAt: string;
  notifiedDonorIds: string[];
}

// In-memory cancellation store
const cancellationStore = new Map<string, CancellationRecord>();

/**
 * Validates whether a blood request state is cancellable
 */
export function isRequestCancellable(currentStatus: string): boolean {
  const cancellableStatuses = [
    'PENDING',
    'MATCHING',
    'PARTIALLY_FULFILLED',
    'PENDING_VERIFICATION',
    'HOSPITAL_VERIFIED',
    'MATCHING_IN_PROGRESS',
    'DONORS_NOTIFIED',
    'DONOR_CONFIRMED',
  ];
  return cancellableStatuses.includes(currentStatus);
}

/**
 * Execute cancellation of a blood request with reason logging
 * and stand-down alert dispatch for active donors.
 */
export function cancelBloodRequest(params: {
  requestId: string;
  currentStatus: string;
  cancelledByUserId: string;
  cancelledByRole: string;
  reason: CancellationReason;
  notes?: string;
  activeDonorIds: string[];
}): { success: boolean; record?: CancellationRecord; error?: string } {
  if (!isRequestCancellable(params.currentStatus)) {
    return {
      success: false,
      error: `Request with status '${params.currentStatus}' cannot be cancelled.`,
    };
  }

  const record: CancellationRecord = {
    requestId: params.requestId,
    cancelledByUserId: params.cancelledByUserId,
    cancelledByRole: params.cancelledByRole,
    reason: params.reason,
    notes: params.notes?.trim(),
    cancelledAt: new Date().toISOString(),
    notifiedDonorIds: [...params.activeDonorIds],
  };

  cancellationStore.set(params.requestId, record);

  return {
    success: true,
    record,
  };
}

/**
 * Get cancellation details for an aborted request
 */
export function getCancellationDetails(requestId: string): CancellationRecord | null {
  const record = cancellationStore.get(requestId);
  return record ? { ...record } : null;
}

/**
 * Formats a friendly stand-down message for donors who were notified
 */
export function generateStandDownMessage(reason: CancellationReason): string {
  switch (reason) {
    case 'FOUND_DONOR_EXTERNAL':
      return 'Thank you for your willingness to help! A matching donor has arrived on-site and fulfilled the requirement.';
    case 'HOSPITAL_STOCK_FULFILLED':
      return 'Emergency requirement has been met directly by hospital emergency reserves. Thank you for standing by!';
    case 'PATIENT_DISCHARGED':
      return 'The patient condition has stabilized and blood transfusion is no longer urgently required.';
    case 'SURGERY_POSTPONED':
      return 'The scheduled surgical procedure has been rescheduled by the attending clinical team.';
    default:
      return 'This blood coordination request has been closed. Thank you for your continued lifesaving support!';
  }
}

/**
 * Reset cancellation store for testing
 */
export function resetCancellationStore(): void {
  cancellationStore.clear();
}
