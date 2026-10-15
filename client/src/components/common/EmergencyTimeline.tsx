import React from 'react';
import { RequestStatus } from '@shared/types';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Search,
  Send,
  UserCheck,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';

interface TimelineProps {
  currentStatus: RequestStatus;
  statusHistory?: any[];
}

const STEPS: { id: RequestStatus | 'STEP_CREATED' | 'STEP_VERIF'; label: string; icon: any }[] = [
  { id: 'STEP_CREATED', label: 'Request Created', icon: Clock },
  { id: 'STEP_VERIF', label: 'Verification', icon: ShieldCheck },
  { id: 'HOSPITAL_VERIFIED', label: 'Hospital Verified', icon: CheckCircle2 },
  { id: 'MATCHING_IN_PROGRESS', label: 'Smart Matching', icon: Search },
  { id: 'DONORS_NOTIFIED', label: 'Donors Notified', icon: Send },
  { id: 'DONOR_CONFIRMED', label: 'Donor Confirmed', icon: UserCheck },
  { id: 'BLOOD_RECEIVED', label: 'Blood Received', icon: PackageCheck },
  { id: 'COMPLETED', label: 'Completed', icon: CheckCircle2 },
];

export const EmergencyTimeline: React.FC<TimelineProps> = ({ currentStatus }) => {
  // Determine current step index (0 to 7)
  const getActiveStepIndex = (status: RequestStatus): number => {
    switch (status) {
      case 'PENDING_VERIFICATION':
        return 1; // Between created and hospital verification
      case 'HOSPITAL_VERIFIED':
        return 2;
      case 'MATCHING_IN_PROGRESS':
        return 3;
      case 'DONORS_NOTIFIED':
        return 4;
      case 'DONOR_CONFIRMED':
        return 5;
      case 'BLOOD_RECEIVED':
        return 6;
      case 'COMPLETED':
        return 7;
      case 'REJECTED':
      case 'EXPIRED':
      case 'CANCELLED':
        return -1;
      default:
        return 0;
    }
  };

  const activeIndex = getActiveStepIndex(currentStatus);
  const isTerminated =
    currentStatus === 'REJECTED' || currentStatus === 'EXPIRED' || currentStatus === 'CANCELLED';

  if (isTerminated) {
    const isCancelled = currentStatus === 'CANCELLED';
    return (
      <div
        className={`p-4 rounded-xl border flex items-center space-x-3 ${
          isCancelled
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-red-50 border-red-200 text-red-900'
        }`}
      >
        <XCircle
          className={`w-5 h-5 flex-shrink-0 ${isCancelled ? 'text-slate-500' : 'text-red-600'}`}
        />
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider">
            {currentStatus === 'REJECTED'
              ? 'Request Rejected by Hospital'
              : currentStatus === 'EXPIRED'
              ? 'Request Expired'
              : 'Request Cancelled & Stood Down'}
          </h4>
          <p
            className={`text-xs mt-0.5 ${
              isCancelled ? 'text-slate-600' : 'text-red-700'
            }`}
          >
            {isCancelled
              ? 'Emergency blood coordination has been safely cancelled. Contacted donors were stood down.'
              : 'This coordination lifecycle is closed. A new request can be created if needed.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between relative">
        {/* Continuous Track Line */}
        <div className="absolute top-4 left-0 right-0 h-1 bg-slate-200 -z-0" />
        <div
          className="absolute top-4 left-0 h-1 bg-crimson-600 transition-all duration-500 -z-0"
          style={{
            width: `${Math.max(0, (activeIndex / (STEPS.length - 1)) * 100)}%`,
          }}
        />

        {STEPS.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isCurrent = index === activeIndex;
          const Icon = step.icon;

          let circleClass = 'bg-white border-2 border-slate-300 text-slate-400';
          if (isCompleted) {
            circleClass = 'bg-crimson-700 border-2 border-crimson-700 text-white';
          } else if (isCurrent) {
            circleClass =
              'bg-white border-2 border-crimson-700 text-crimson-700 ring-4 ring-crimson-100 animate-pulse';
          }

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${circleClass}`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] mt-2 font-medium text-center max-w-[70px] leading-tight ${
                  isCurrent
                    ? 'text-crimson-700 font-bold'
                    : isCompleted
                    ? 'text-slate-800 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
