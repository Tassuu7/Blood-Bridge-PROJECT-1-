import React, { useState } from 'react';
import { Trophy, Medal, Flame, Heart, Award, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LeaderboardEntry {
  rank: number;
  donorId: string;
  name: string;
  bloodGroup: string;
  totalDonations: number;
  livesSaved: number;
  reputationPoints: number;
  streak: number;
  tier: 'LEGENDARY_GUARDIAN' | 'GOLD_CHAMPION' | 'SILVER_HERO' | 'VOLUNTEER';
  badgesCount: number;
}

const SAMPLE_LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    donorId: 'd1',
    name: 'Vikram Mehta',
    bloodGroup: 'O-',
    totalDonations: 28,
    livesSaved: 84,
    reputationPoints: 4850,
    streak: 6,
    tier: 'LEGENDARY_GUARDIAN',
    badgesCount: 7,
  },
  {
    rank: 2,
    donorId: 'd2',
    name: 'Ananya Sharma',
    bloodGroup: 'A+',
    totalDonations: 22,
    livesSaved: 66,
    reputationPoints: 3720,
    streak: 4,
    tier: 'LEGENDARY_GUARDIAN',
    badgesCount: 6,
  },
  {
    rank: 3,
    donorId: 'd3',
    name: 'Dr. Rahul Verma',
    bloodGroup: 'B-',
    totalDonations: 19,
    livesSaved: 57,
    reputationPoints: 3100,
    streak: 5,
    tier: 'LEGENDARY_GUARDIAN',
    badgesCount: 5,
  },
  {
    rank: 4,
    donorId: 'd4',
    name: 'Priya Iyer',
    bloodGroup: 'AB-',
    totalDonations: 14,
    livesSaved: 42,
    reputationPoints: 2350,
    streak: 3,
    tier: 'GOLD_CHAMPION',
    badgesCount: 5,
  },
  {
    rank: 5,
    donorId: 'd5',
    name: 'Karan Malhotra',
    bloodGroup: 'O+',
    totalDonations: 11,
    livesSaved: 33,
    reputationPoints: 1890,
    streak: 2,
    tier: 'GOLD_CHAMPION',
    badgesCount: 4,
  },
  {
    rank: 6,
    donorId: 'd6',
    name: 'Neha Gupta',
    bloodGroup: 'A-',
    totalDonations: 8,
    livesSaved: 24,
    reputationPoints: 1250,
    streak: 2,
    tier: 'SILVER_HERO',
    badgesCount: 3,
  },
];

export const LeaderboardPage: React.FC = () => {
  const [filter] = useState<string>('ALL');

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/donor/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
            <Trophy className="w-3.5 h-3.5" />
            Community Hall of Fame
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-slate-900">BloodBridge Lifesavers Leaderboard</h1>
          <p className="text-sm text-slate-500 max-w-xl mx-auto">
            Honoring volunteers who show up in times of emergency. Every single donation saves up to three lives.
          </p>
        </div>

        {/* Podium Top 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          {SAMPLE_LEADERBOARD.slice(0, 3).map((donor) => {
            const isFirst = donor.rank === 1;
            return (
              <div
                key={donor.donorId}
                className={`bg-white rounded-2xl border p-6 text-center space-y-3 relative shadow-sm ${
                  isFirst
                    ? 'border-amber-300 ring-2 ring-amber-400/40 md:-translate-y-2'
                    : 'border-slate-200'
                }`}
              >
                <div
                  className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center font-black text-lg ${
                    donor.rank === 1
                      ? 'bg-amber-400 text-white shadow-lg shadow-amber-200'
                      : donor.rank === 2
                      ? 'bg-slate-300 text-slate-800'
                      : 'bg-amber-700 text-white'
                  }`}
                >
                  {donor.rank === 1 ? <Trophy className="w-6 h-6" /> : `#${donor.rank}`}
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">{donor.name}</h3>
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                    <span>{donor.bloodGroup}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Donations</span>
                    <span className="font-bold text-slate-900">{donor.totalDonations}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Lives Saved</span>
                    <span className="font-bold text-emerald-600">{donor.livesSaved}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">All Ranking Donors</h3>
            <span className="text-xs text-slate-500">{SAMPLE_LEADERBOARD.length} active heroes</span>
          </div>

          <div className="divide-y divide-slate-100">
            {SAMPLE_LEADERBOARD.map((donor) => (
              <div
                key={donor.donorId}
                className="p-4 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="flex items-center space-x-3.5">
                  <span className="w-6 text-center font-bold text-sm text-slate-400">
                    {donor.rank}
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900">{donor.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-black">
                        {donor.bloodGroup}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3 text-red-500" />
                        {donor.livesSaved} lives saved
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-500" />
                        {donor.streak} streak
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-slate-900 block">
                      {donor.reputationPoints.toLocaleString()}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">points</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default LeaderboardPage;
