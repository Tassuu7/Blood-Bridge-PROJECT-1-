import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShieldCheck, PhoneCall, AlertOctagon } from 'lucide-react';
import { CLINICAL_DISCLAIMER } from '@shared/bloodRules';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-20">
      {/* Required Clinical Coordination Disclaimer Banner */}
      <div className="bg-amber-50/70 border-b border-amber-200/60 py-3.5 px-4">
        <div className="max-w-7xl mx-auto flex items-start sm:items-center space-x-3">
          <AlertOctagon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
          <p className="text-xs text-amber-900 leading-relaxed font-medium">
            <span className="font-bold">Clinical Coordination Notice: </span>
            {CLINICAL_DISCLAIMER}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center space-x-2.5">
              <img src="/logo.svg" alt="BloodBridge" className="w-7 h-7" />
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                Blood<span className="text-crimson-700">Bridge</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Every second matters during blood emergencies. BloodBridge connects verified hospital
              requests with compatible nearby donors through transparent real-time coordination.
            </p>
            <div className="flex items-center space-x-2 text-xs font-semibold text-crimson-700">
              <PhoneCall className="w-4 h-4" />
              <span>Emergency Desk: 1-800-BLOOD-BRIDGE (Demo)</span>
            </div>
          </div>

          {/* Workflows */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Coordination Workflow
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>1. Emergency Blood Request</li>
              <li>2. Hospital Verification</li>
              <li>3. Smart Donor Matching</li>
              <li>4. Push & Notification</li>
              <li>5. Real-Time Tracking</li>
              <li>6. Smart Radius Escalation</li>
              <li>7. Hospital Receipt & Close</li>
            </ul>
          </div>

          {/* User Roles */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Platform Roles
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <Link to="/donor/dashboard" className="hover:text-crimson-700 transition">
                  Donor Portal
                </Link>
              </li>
              <li>
                <Link to="/requester/dashboard" className="hover:text-crimson-700 transition">
                  Requester Portal
                </Link>
              </li>
              <li>
                <Link to="/hospital/dashboard" className="hover:text-crimson-700 transition">
                  Hospital Verification Center
                </Link>
              </li>
              <li>
                <Link to="/admin/dashboard" className="hover:text-crimson-700 transition">
                  Admin Command Center
                </Link>
              </li>
              <li>
                <Link to="/leaderboard" className="hover:text-crimson-700 transition font-medium text-amber-700">
                  ★ Community Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust & Privacy */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Trust & Privacy
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Personal patient contact numbers are never broadcasted publicly to unknown parties. Donor
              and requester connections are orchestrated exclusively through controlled, verified
              hospital workflows.
            </p>
            <div className="mt-4 flex items-center space-x-2 text-xs text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Encrypted & Role-Protected</span>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <p>© 2026 BloodBridge Coordination Platform. All rights reserved.</p>
          <div className="flex items-center space-x-4">
            <span>Synthetic Demo Mode</span>
            <span>•</span>
            <span>Zero Real PII</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
