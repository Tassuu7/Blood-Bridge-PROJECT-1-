import React, { useState } from 'react';
import { api } from '../../services/api';
import { useNotifications } from '../../contexts/NotificationContext';
import { AlertTriangle, X, ShieldAlert, CheckCircle } from 'lucide-react';

interface CancelRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  patientInitials?: string;
  onCancelled: () => void;
}

const REASON_OPTIONS = [
  { value: 'FOUND_DONOR_EXTERNAL', label: 'Directed donor arranged by family / attendants' },
  { value: 'PATIENT_DISCHARGED', label: 'Patient stabilized or discharged by clinical team' },
  { value: 'SURGERY_POSTPONED', label: 'Procedure or surgery rescheduled' },
  { value: 'HOSPITAL_STOCK_FULFILLED', label: 'Fulfilled by internal hospital blood bank reserves' },
  { value: 'ENTERED_IN_ERROR', label: 'Submitted in error or duplicate entry' },
  { value: 'OTHER', label: 'Other clinical or logistical reason' },
];

export const CancelRequestModal: React.FC<CancelRequestModalProps> = ({
  isOpen,
  onClose,
  requestId,
  patientInitials,
  onCancelled,
}) => {
  const { showToast } = useNotifications();

  const [reason, setReason] = useState('FOUND_DONOR_EXTERNAL');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await api.cancelBloodRequest(requestId, {
        reason,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        showToast(
          'Request Cancelled',
          'Emergency request cancelled. Contacted donors have been stood down safely.',
          'info'
        );
        onCancelled();
        onClose();
      } else {
        setErrorMessage(res.message || 'Could not cancel request.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while cancelling the request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Cancel Emergency Request</h3>
              <p className="text-xs text-slate-500">
                {requestId} {patientInitials ? `(Patient ${patientInitials})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Stand-Down Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Automatic Donor Stand-Down Notice:</p>
            <p className="text-blue-700 text-[11px] leading-relaxed">
              When you cancel, all active volunteers currently notified or en route will immediately
              receive a respectful stand-down alert so their travel is not wasted.
            </p>
          </div>

          {/* Cancellation Taxonomy Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Reason for Cancellation <span className="text-crimson-600">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-300 p-3 bg-white focus:outline-none focus:ring-2 focus:ring-crimson-600"
              required
            >
              {REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Resolution Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Resolution Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Provide any additional clinical or logistical context..."
              className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-crimson-600"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-crimson-700 hover:bg-crimson-800 shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation & Stand Down'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
