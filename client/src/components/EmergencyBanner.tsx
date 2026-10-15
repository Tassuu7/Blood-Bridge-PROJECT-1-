import React, { useState, useEffect } from 'react';
import { AlertCircle, X, MapPin, Radio } from 'lucide-react';

export interface EmergencyAlert {
  id: string;
  level: string;
  title: string;
  incidentDescription: string;
  affectedRegion: string;
  targetBloodGroups: string[];
}

export const EmergencyBanner: React.FC<{ alerts?: EmergencyAlert[] }> = ({ alerts }) => {
  const [internalAlerts, setInternalAlerts] = useState<EmergencyAlert[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (alerts !== undefined) {
      setInternalAlerts(alerts);
      return;
    }

    const fetchActiveAlerts = async () => {
      try {
        const res = await fetch('/api/broadcasts/active');
        if (res.ok) {
          const body = await res.json();
          if (body.success && Array.isArray(body.data)) {
            setInternalAlerts(body.data);
          }
        }
      } catch {
        // Fallback gracefully if endpoint is unavailable
      }
    };

    fetchActiveAlerts();
  }, [alerts]);

  const effectiveAlerts = alerts !== undefined ? alerts : internalAlerts;
  const activeAlerts = effectiveAlerts.filter((a) => !dismissed[a.id]);
  if (activeAlerts.length === 0) return null;

  const current = activeAlerts[0];

  return (
    <div className="bg-red-600 text-white shadow-lg border-b border-red-700 animate-slide-down">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="relative flex-shrink-0">
            <Radio className="w-5 h-5 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-ping" />
          </div>

          <div className="text-sm font-medium truncate">
            <span className="font-extrabold uppercase tracking-wide bg-red-800 px-2 py-0.5 rounded text-[11px] mr-2">
              EMERGENCY ALERT
            </span>
            <span className="font-bold mr-2">{current.title}:</span>
            <span className="opacity-90">{current.incidentDescription}</span>
          </div>

          <div className="hidden md:flex items-center gap-2 flex-shrink-0 text-xs bg-red-700/60 px-2.5 py-1 rounded-full">
            <MapPin className="w-3.5 h-3.5 text-red-200" />
            <span>{current.affectedRegion}</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
            {current.targetBloodGroups.map((bg) => (
              <span key={bg} className="px-1.5 py-0.5 bg-white text-red-700 text-xs font-black rounded">
                {bg}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={() => setDismissed((prev) => ({ ...prev, [current.id]: true }))}
          className="p-1 hover:bg-red-700 rounded transition flex-shrink-0 text-red-200 hover:text-white"
          title="Dismiss banner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
