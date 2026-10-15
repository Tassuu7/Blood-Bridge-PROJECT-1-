import { describe, it, expect } from 'vitest';
import {
  isValidBloodGroup,
  isValidUnits,
  isFutureDeadline,
  VALID_BLOOD_GROUPS,
} from '../validators';

describe('Client Validation Utilities Unit Tests', () => {
  describe('isValidBloodGroup', () => {
    it('accepts all 8 recognized standard ABO/Rh blood groups', () => {
      VALID_BLOOD_GROUPS.forEach((bg) => {
        expect(isValidBloodGroup(bg)).toBe(true);
      });
    });

    it('rejects invalid or non-standard blood group strings', () => {
      expect(isValidBloodGroup('C+')).toBe(false);
      expect(isValidBloodGroup('O')).toBe(false);
      expect(isValidBloodGroup('AB')).toBe(false);
      expect(isValidBloodGroup('random')).toBe(false);
      expect(isValidBloodGroup('')).toBe(false);
    });
  });

  describe('isValidUnits', () => {
    it('accepts valid emergency unit counts between 1 and 10', () => {
      expect(isValidUnits(1)).toBe(true);
      expect(isValidUnits(5)).toBe(true);
      expect(isValidUnits(10)).toBe(true);
    });

    it('rejects unit counts below 1 or above 10', () => {
      expect(isValidUnits(0)).toBe(false);
      expect(isValidUnits(-1)).toBe(false);
      expect(isValidUnits(11)).toBe(false);
      expect(isValidUnits(25)).toBe(false);
    });

    it('rejects fractional or non-integer unit quantities', () => {
      expect(isValidUnits(1.5)).toBe(false);
      expect(isValidUnits(3.14)).toBe(false);
    });
  });

  describe('isFutureDeadline', () => {
    it('accepts timestamps scheduled in the future', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead
      expect(isFutureDeadline(futureDate)).toBe(true);
      expect(isFutureDeadline(futureDate.toISOString())).toBe(true);
    });

    it('rejects timestamps that have already elapsed in the past', () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      expect(isFutureDeadline(pastDate)).toBe(false);
      expect(isFutureDeadline(pastDate.toISOString())).toBe(false);
    });

    it('rejects malformed or unparseable date strings', () => {
      expect(isFutureDeadline('not-a-date')).toBe(false);
      expect(isFutureDeadline('')).toBe(false);
    });
  });
});
