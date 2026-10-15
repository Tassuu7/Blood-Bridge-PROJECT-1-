import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useNotifications } from '../contexts/NotificationContext';
import { CreateRequestModal } from '../components/modals/CreateRequestModal';
import { CancelRequestModal } from '../components/modals/CancelRequestModal';
import { EmergencyTimeline } from '../components/common/EmergencyTimeline';
import {
  Heart,
  PlusCircle,
  Building2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  UserCheck,
  PackageCheck,
  RefreshCw,
  Layers,
  XCircle,
} from 'lucide-react';

export const RequesterDashboard: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showToast } = useNotifications();

  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const res = await api.getBloodRequests();
      if (res.success) {
        setRequests(res.requests);
        if (res.requests.length > 0 && !selectedRequestId) {
          setSelectedRequestId(res.requests[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load blood requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // Real-time socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      loadRequests();
    };

    const handleDonorAccepted = (data: any) => {
      showToast(
        '🎉 Donor Confirmed!',
        `A compatible ${data.bloodGroup} donor has accepted your emergency request!`,
        'success'
      );
      loadRequests();
    };

    const handleEscalated = (data: any) => {
      showToast(
        '⚡ Search Radius Expanded',
        `Search escalated to Stage ${data.stageNumber} (${data.radiusKm} km radius).`,
        'warning'
      );
      loadRequests();
    };

    socket.on('request:verified', handleUpdate);
    socket.on('donor:matched', handleUpdate);
    socket.on('donor:accepted', handleDonorAccepted);
    socket.on('request:escalated', handleEscalated);
    socket.on('blood:received', handleUpdate);
    socket.on('request:completed', handleUpdate);
    socket.on('request:cancelled', handleUpdate);

    return () => {
      socket.off('request:verified', handleUpdate);
      socket.off('donor:matched', handleUpdate);
      socket.off('donor:accepted', handleDonorAccepted);
      socket.off('request:escalated', handleEscalated);
      socket.off('blood:received', handleUpdate);
      socket.off('request:completed', handleUpdate);
      socket.off('request:cancelled', handleUpdate);
    };
  }, [socket, showToast]);

  const handleMarkBloodReceived = async (requestId: string) => {
    try {
      const res = await api.markBloodReceived(requestId, 'Blood safely received at hospital.');
      if (res.success) {
        showToast('Request Completed', 'Blood received confirmed. Coordination safely closed.', 'success');
        loadRequests();
      }
    } catch (err: any) {
      showToast('Action Failed', err.message || 'Could not complete request.', 'error');
    }
  };

  const handleTestEscalate = async (requestId: string) => {
    try {
      const res = await api.triggerEscalation(requestId);
      if (res.success) {
        showToast('Radius Escalated', `Manual escalation triggered: Stage ${res.stage} (${res.radiusKm} km).`, 'info');
        loadRequests();
      }
    } catch (err: any) {
      showToast('Escalation Failed', err.message || 'Failed to trigger escalation.', 'error');
    }
  };

  const activeRequest = requests.find((r) => r.id === selectedRequestId) || requests[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & New Request CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white border border-slate-200 shadow-card">
        <div>
          <h2 className="text-xl font-black text-slate-900">Requester Coordination Center</h2>
          <p className="text-xs text-slate-500 mt-1">
            Create, track, and monitor real-time hospital verified blood emergency requests.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-5 py-3 rounded-xl bg-crimson-700 hover:bg-crimson-800 text-white font-bold text-xs shadow-md transition flex items-center space-x-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create Emergency Blood Request</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm font-bold text-slate-400 flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-crimson-700" />
          <span>Synchronizing requests...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <Heart className="w-12 h-12 text-crimson-200 mx-auto mb-3" />
          <h3 className="font-bold text-base text-slate-800">No Emergency Requests</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            You haven't initiated any blood requests yet. Click the button above to start an emergency
            request.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Requests Sidebar */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              Your Emergency Requests ({requests.length})
            </h3>
            {requests.map((req) => {
              const isSelected = req.id === activeRequest?.id;
              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequestId(req.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white border-crimson-600 ring-2 ring-crimson-100 shadow-sm'
                      : 'bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{req.id}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-red-100 text-red-800">
                      {req.urgency}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center space-x-2">
                    <span className="text-base font-black text-crimson-800 bg-red-50 px-2 py-0.5 rounded">
                      {req.bloodGroup}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      {req.unitsRequired} {req.unitsRequired === 1 ? 'Unit' : 'Units'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-2 truncate">
                    {req.hospital?.hospitalName || 'Hospital'}
                  </p>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-600">
                      Status: <strong className="text-slate-900">{req.status.replace(/_/g, ' ')}</strong>
                    </span>
                    {req.isDuplicateFlagged && (
                      <span className="text-amber-600 font-bold">⚠ Duplicate Flag</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Request Live Tracking View */}
          {activeRequest && (
            <div className="lg:col-span-2 space-y-6">
              {/* Request Header Card */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-card space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl font-black text-slate-900">{activeRequest.id}</span>
                      <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-crimson-100 text-crimson-800">
                        {activeRequest.bloodGroup} ({activeRequest.unitsRequired} Units)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Patient Initials: <strong>{activeRequest.patientInitials}</strong> • Created{' '}
                      {new Date(activeRequest.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {activeRequest.status !== 'COMPLETED' && activeRequest.status !== 'CANCELLED' && activeRequest.status !== 'REJECTED' && (
                    <div className="flex items-center space-x-2 self-start flex-wrap gap-y-2">
                      <button
                        onClick={() => handleMarkBloodReceived(activeRequest.id)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center space-x-1.5"
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>Confirm Blood Received</span>
                      </button>
                      <button
                        onClick={() => setIsCancelModalOpen(true)}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-slate-700 border border-slate-200 font-bold text-xs shadow-sm transition flex items-center space-x-1.5"
                      >
                        <XCircle className="w-4 h-4 text-slate-500 hover:text-red-600" />
                        <span>Cancel Request</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 8-Step Timeline */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Live Coordination Lifecycle Timeline
                  </h4>
                  <EmergencyTimeline currentStatus={activeRequest.status} />
                </div>

                {/* Escalation Stage Banner */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <Layers className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900">
                        Escalation Radius: Stage {activeRequest.currentEscalationStage} (
                        {activeRequest.currentEscalationStage === 1
                          ? '3 km Immediate'
                          : activeRequest.currentEscalationStage === 2
                          ? '7 km Expanded'
                          : activeRequest.currentEscalationStage === 3
                          ? '15 km City Network'
                          : 'Regional Blood Bank Network'}
                        )
                      </span>
                      <p className="text-slate-500 text-[11px]">
                        Radius expands automatically if no responses are confirmed within urgency window.
                      </p>
                    </div>
                  </div>

                  {activeRequest.status !== 'COMPLETED' && (
                    <button
                      onClick={() => handleTestEscalate(activeRequest.id)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition flex-shrink-0"
                    >
                      ⚡ Test Expand Radius
                    </button>
                  )}
                </div>

                {/* Hospital Information */}
                <div className="text-xs space-y-1 text-slate-600 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center space-x-2 font-bold text-slate-900 text-sm">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span>{activeRequest.hospital?.hospitalName}</span>
                  </div>
                  <p className="pl-6 text-slate-500">{activeRequest.hospital?.address}</p>
                </div>
              </div>

              {/* Matched Donors & Responses Card */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <UserCheck className="w-4 h-4 text-crimson-700" />
                    <span>Matched Donors & Real-Time Responses</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    {activeRequest.matches?.length || 0} contacted
                  </span>
                </div>

                {!activeRequest.matches || activeRequest.matches.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Awaiting hospital verification before running smart donor matching algorithm.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {activeRequest.matches.map((match: any) => {
                      const isAccepted = match.status === 'ACCEPTED';
                      const isDeclined = match.status === 'DECLINED';

                      return (
                        <div
                          key={match.id}
                          className="py-3 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">
                              {match.donor?.user?.fullName || 'Volunteer Donor'}
                            </span>
                            <span className="text-slate-500 block text-[11px]">
                              Blood Group {match.donor?.bloodGroup} • {match.distanceKm} km away •{' '}
                              {match.matchScore}% match score
                            </span>
                          </div>

                          <div className="text-right">
                            {isAccepted ? (
                              <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Accepted & En Route</span>
                              </span>
                            ) : isDeclined ? (
                              <span className="px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-500 text-[11px]">
                                Declined
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 text-[11px] animate-pulse">
                                Contacted / Awaiting Response
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Request Modal */}
      <CreateRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onRequestCreated={() => {
          loadRequests();
        }}
      />

      {/* Cancel Request Modal */}
      {activeRequest && (
        <CancelRequestModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          requestId={activeRequest.id}
          patientInitials={activeRequest.patientInitials}
          onCancelled={() => {
            loadRequests();
          }}
        />
      )}
    </div>
  );
};
