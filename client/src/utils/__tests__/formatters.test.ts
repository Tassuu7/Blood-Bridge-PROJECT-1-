import { describe, it, expect } from 'vitest';
import {
  formatDistance,
  formatRelativeTime,
  getUrgencyBadgeClasses,
} from '../formatters';

describe('Client UI Formatters Unit Tests', () => {
  describe('formatDistance', () => {
    it('formats distances under 1 kilometer as rounded meters', () => {
      expect(formatDistance(0.35)).toBe('350 m');
      expect(formatDistance(0.005)).toBe('5 m');
      expect(formatDistance(0.999)).toBe('999 m');
    });

    it('formats distances 1 kilometer and above with one decimal place', () => {
      expect(formatDistance(1.0)).toBe('1.0 km');
      expect(formatDistance(4.56)).toBe('4.6 km');
      expect(formatDistance(15.22)).toBe('15.2 km');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats immediate past moments as just now', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('formats past minutes correctly', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
    });

    it('formats past hours correctly', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    it('formats future minutes correctly', () => {
      const tenMinFuture = new Date(Date.now() + 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinFuture)).toBe('in 10 min');
    });

    it('formats future hours correctly', () => {
      const twoHoursFuture = new Date(Date.now() + 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursFuture)).toBe('in 2 hr');
    });
  });

  describe('getUrgencyBadgeClasses', () => {
    it('returns pulsing red styles for CRITICAL urgency', () => {
      const classes = getUrgencyBadgeClasses('CRITICAL');
      expect(classes).toContain('bg-red-600');
      expect(classes).toContain('animate-pulse');
      expect(classes).toContain('text-white');
    });

    it('returns highlighted amber border styles for URGENT urgency', () => {
      const classes = getUrgencyBadgeClasses('URGENT');
      expect(classes).toContain('bg-amber-100');
      expect(classes).toContain('border-amber-300');
      expect(classes).toContain('text-amber-900');
    });

    it('returns neutral muted slate styles for NORMAL urgency', () => {
      const classes = getUrgencyBadgeClasses('NORMAL');
      expect(classes).toContain('bg-slate-100');
      expect(classes).toContain('text-slate-700');
    });
  });
});
