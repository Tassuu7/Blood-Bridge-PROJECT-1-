import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useNotifications } from '../contexts/NotificationContext';
import { AcceptDeclineModal } from '../components/modals/AcceptDeclineModal';
import { DonorPreferencesModal } from '../components/modals/DonorPreferencesModal';
import { HealthScreeningQuiz } from '../components/HealthScreeningQuiz';
import { BadgeDisplay, BadgeItem } from '../components/BadgeDisplay';
import { AvailabilityStatus } from '@shared/types';
import {
  Heart,
  Activity,
  CheckCircle2,
  Clock,
  Building2,
  Navigation,
  Shield,
  Award,
  AlertTriangle,
  RefreshCw,
  Sliders,
  HeartPulse,
  Trophy,
  X,
} from 'lucide-react';

export const DonorDashboard: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showToast } = useNotifications();

  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [activeCommitments, setActiveCommitments] = useState<any[]>([]);
  const [donationHistory, setDonationHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);

  const [preferences, setPreferences] = useState<any | null>(null);
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false);
  const [isScreeningModalOpen, setIsScreeningModalOpen] = useState(false);
  const [badges, setBadges] = useState<BadgeItem[]>([]);

  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const loadDonorData = async () => {
    setIsLoading(true);
    try {
      const [res, prefsRes, badgesRes] = await Promise.allSettled([
        api.getDonorDashboard(),
        api.getDonorPreferences(),
        api.getDonorBadges(),
      ]);

      if (res.status === 'fulfilled' && res.value.success) {
        setProfile(res.value.profile);
        setIncomingRequests(res.value.incomingRequests);
        setActiveCommitments(res.value.activeCommitments);
        setDonationHistory(res.value.donationHistory);
        setStats(res.value.stats);
      }

      if (prefsRes.status === 'fulfilled' && prefsRes.value.success) {
        setPreferences(prefsRes.value.data);
      }

      if (badgesRes.status === 'fulfilled' && badgesRes.value.success) {
        setBadges(badgesRes.value.data?.badges || []);
      }
    } catch (err: any) {
      console.error('Failed to load donor dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDonorData();
  }, []);

  // Listen to live real-time donor dispatches
  useEffect(() => {
    if (!socket) return;

    const handleDonorNotified = (data: any) => {
      showToast(
        '🚨 Urgent Emergency Call!',
        `Blood group ${data.bloodGroup} needed at ${data.hospitalName} (${data.distanceKm} km away).`,
        'error'
      );
      loadDonorData();
    };

    socket.on('donor:notified', handleDonorNotified);

    return () => {
      socket.off('donor:notified', handleDonorNotified);
    };
  }, [socket, showToast]);

  const handleStatusChange = async (newStatus: AvailabilityStatus) => {
    setIsUpdatingStatus(true);
    try {
      const res = await api.updateDonorAvailability(newStatus);
      if (res.success) {
        setProfile((prev: any) => ({ ...prev, availabilityStatus: newStatus }));
        showToast('Availability Updated', `Your status is now ${newStatus.replace('_', ' ')}.`, 'success');
      }
    } catch (err: any) {
      showToast('Update Failed', err.message || 'Could not update status.', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSavePreferences = async (data: any) => {
    try {
      const res = await api.updateDonorPreferences(data);
      if (res.success) {
        setPreferences(res.data);
        showToast('Preferences Saved', 'Dispatch travel radius and alert channels updated.', 'success');
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Could not update preferences', 'error');
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center space-x-3 text-crimson-700 font-bold text-sm">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading donor coordination command center...</span>
        </div>
      </div>
    );
  }

  const currentStatus = profile?.availabilityStatus || 'AVAILABLE';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Donor Header & Profile Overview */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-crimson-100 border border-crimson-200 flex flex-col items-center justify-center flex-shrink-0">
            <span className="text-xl font-black text-crimson-800">{profile?.bloodGroup || 'O-'}</span>
            <span className="text-[9px] uppercase font-bold text-crimson-600">Donor</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-slate-900">{user?.fullName || 'Active Donor'}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {profile?.addressCity || 'Metro Area'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Registered Voluntary Donor • Connected to Local Hospital Dispatch
            </p>
          </div>
        </div>

        {/* Availability & Quick Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          {/* Availability Controls */}
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 px-2">
              My Availability Status
            </span>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <button
                onClick={() => handleStatusChange('AVAILABLE')}
                disabled={isUpdatingStatus}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  currentStatus === 'AVAILABLE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Available</span>
              </button>

              <button
                onClick={() => handleStatusChange('AVAILABLE_LATER')}
                disabled={isUpdatingStatus}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  currentStatus === 'AVAILABLE_LATER'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Later</span>
              </button>

              <button
                onClick={() => handleStatusChange('NOT_AVAILABLE')}
                disabled={isUpdatingStatus}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  currentStatus === 'NOT_AVAILABLE'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Paused</span>
              </button>
            </div>
          </div>

          <div className="flex sm:flex-col gap-1.5 justify-center">
            <button
              onClick={() => setIsPrefsModalOpen(true)}
              className="flex-1 sm:flex-none px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
              title="Configure alert travel radius and quiet hours"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>Preferences</span>
            </button>

            <button
              onClick={() => setIsScreeningModalOpen(true)}
              className="flex-1 sm:flex-none px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
              title="Pre-donation clinical safety self-check"
            >
              <HeartPulse className="w-3.5 h-3.5 text-red-600" />
              <span>Self-Screen</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-soft">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Donations</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-black text-slate-900">{stats?.totalDonations || 0}</span>
            <Award className="w-6 h-6 text-crimson-600 opacity-70" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-soft">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Reliability Score</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-black text-emerald-600">
              {stats?.reliabilityScore || 98}%
            </span>
            <Activity className="w-6 h-6 text-emerald-600 opacity-70" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-soft">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Pending Calls</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-black text-crimson-700">{incomingRequests.length}</span>
            <span className="w-3 h-3 rounded-full bg-crimson-600 animate-ping" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-soft">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Commitments</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-black text-blue-600">{activeCommitments.length}</span>
            <Heart className="w-6 h-6 text-blue-600 opacity-70 fill-blue-100" />
          </div>
        </div>
      </div>

      {/* Achievements & Recognition Badges */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Lifesaver Milestones & Badges</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {badges.length} Unlocked
            </span>
          </div>
          <Link
            to="/leaderboard"
            className="text-xs font-semibold text-crimson-700 hover:text-crimson-800 hover:underline flex items-center gap-1"
          >
            <span>View Hall of Fame</span>
            <span>→</span>
          </Link>
        </div>

        {badges.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>Respond to emergency dispatches to earn badges like <strong>First Drop</strong> and <strong>Lightning Responder</strong>.</span>
            <Link
              to="/leaderboard"
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition text-center"
            >
              Check Leaderboard
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5 pt-1">
            {badges.map((badge) => (
              <BadgeDisplay key={badge.badgeId} badge={badge} />
            ))}
          </div>
        )}
      </div>

      {/* Incoming Emergency Requests Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>🚨 Live Emergency Requests</span>
              {incomingRequests.length > 0 && (
                <span className="text-xs bg-red-100 text-crimson-700 font-bold px-2 py-0.5 rounded-full">
                  {incomingRequests.length} Pending
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              Hospitals verified these emergencies. Your blood group is compatible.
            </p>
          </div>
        </div>

        {incomingRequests.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h4 className="font-bold text-sm text-slate-800">No Pending Emergency Calls</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Your status is active. As soon as a nearby hospital verifies a compatible emergency, you
              will receive an instant dispatch.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incomingRequests.map((match) => {
              const req = match.bloodRequest;
              return (
                <div
                  key={match.id}
                  className="p-5 rounded-2xl bg-white border-2 border-red-200 shadow-card flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg font-black px-2.5 py-0.5 rounded-lg bg-red-100 text-red-900">
                          {req.bloodGroup}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {req.unitsRequired} {req.unitsRequired === 1 ? 'Unit' : 'Units'} Needed
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white uppercase animate-pulse">
                        {req.urgency}
                      </span>
                    </div>

                    <div className="text-xs space-y-1 text-slate-600">
                      <div className="flex items-center space-x-1.5 font-semibold text-slate-900">
                        <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span>{req.hospital.hospitalName}</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Navigation className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span>Distance: {match.distanceKm} km from you</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-red-700 font-medium">
                        <Clock className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span>
                          Required by:{' '}
                          {new Date(req.requiredBy).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-700">
                      {match.matchScore}% Match Compatibility
                    </span>
                    <button
                      onClick={() => {
                        setSelectedMatch(match);
                        setIsModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-crimson-700 hover:bg-crimson-800 text-white font-bold text-xs shadow-sm transition"
                    >
                      Review & Respond
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Commitments Section */}
      {activeCommitments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            🩸 Active Commitments (En Route / In Coordination)
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {activeCommitments.map((comm) => (
              <div
                key={comm.id}
                className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white uppercase">
                      Accepted Call
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {comm.bloodRequest.id} — {comm.bloodRequest.bloodGroup} (
                      {comm.bloodRequest.unitsRequired} Units)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Destination: <strong>{comm.bloodRequest.hospital.hospitalName}</strong> (
                    {comm.bloodRequest.hospital.address})
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-800 block">
                    Hospital Coordination Active
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Present at Hospital Blood Bank upon arrival
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Donation History Section */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">Past Donation History</h3>
        {donationHistory.length === 0 ? (
          <div className="p-6 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
            No completed donations logged in this demo account yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden text-xs">
            {donationHistory.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">
                    {item.bloodRequest.hospital.hospitalName}
                  </span>
                  <span className="text-slate-500 block text-[11px] mt-0.5">
                    {item.bloodRequest.bloodGroup} • {item.bloodRequest.unitsRequired} Units Donated
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-600 font-bold block">Confirmed Infused</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(item.respondedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accept / Decline Modal */}
      <AcceptDeclineModal
        isOpen={isModalOpen}
        match={selectedMatch}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedMatch(null);
        }}
        onResponded={loadDonorData}
      />

      {/* Pre-Donation Health Screening Modal */}
      {isScreeningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 relative">
            <button
              onClick={() => setIsScreeningModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              title="Close screening quiz"
            >
              <X className="w-5 h-5" />
            </button>
            <HealthScreeningQuiz onComplete={() => {}} />
          </div>
        </div>
      )}

      {/* Alert & Dispatch Preferences Modal */}
      <DonorPreferencesModal
        isOpen={isPrefsModalOpen}
        onClose={() => setIsPrefsModalOpen(false)}
        initialDistanceKm={preferences?.maxTravelDistanceKm || 25}
        initialChannels={preferences?.channels || ['PUSH', 'SMS']}
        initialQuietHours={preferences?.quietHoursEnabled || false}
        initialEmergencyOnly={preferences?.emergencyOnly || false}
        onSave={handleSavePreferences}
      />
    </div>
  );
};
