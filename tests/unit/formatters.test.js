/**
 * Unit tests for src/lib/formatters.js — the shared formatting module.
 * Tests formatPhoneNumber and getInitials (pure functions).
 * escapeHtml is tested separately since it requires a DOM environment.
 */
import { describe, it, expect } from 'vitest';
import { formatPhoneNumber, getInitials } from '../../src/lib/formatters.js';


describe('formatPhoneNumber', () => {
  it('formats 10-digit US number', () => {
    expect(formatPhoneNumber('6045551234')).toBe('+1 (604) 555-1234');
  });

  it('formats 11-digit US number with leading 1', () => {
    expect(formatPhoneNumber('16045551234')).toBe('+1 (604) 555-1234');
  });

  it('formats number with +1 prefix', () => {
    expect(formatPhoneNumber('+16045551234')).toBe('+1 (604) 555-1234');
  });

  it('formats number with spaces and dashes', () => {
    expect(formatPhoneNumber('604-555-1234')).toBe('+1 (604) 555-1234');
  });

  it('formats number with parens', () => {
    expect(formatPhoneNumber('(604) 555-1234')).toBe('+1 (604) 555-1234');
  });

  it('formats E.164 number', () => {
    expect(formatPhoneNumber('+16045551234')).toBe('+1 (604) 555-1234');
  });

  it('formats number with dots', () => {
    expect(formatPhoneNumber('604.555.1234')).toBe('+1 (604) 555-1234');
  });

  it('returns "Unknown" for null', () => {
    expect(formatPhoneNumber(null)).toBe('Unknown');
  });

  it('returns "Unknown" for undefined', () => {
    expect(formatPhoneNumber(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" for empty string', () => {
    expect(formatPhoneNumber('')).toBe('Unknown');
  });

  it('returns raw value for non-US numbers', () => {
    expect(formatPhoneNumber('+442071234567')).toBe('+442071234567');
  });

  it('returns raw value for short numbers', () => {
    expect(formatPhoneNumber('911')).toBe('911');
  });

  it('returns raw value for very long numbers', () => {
    expect(formatPhoneNumber('+4420712345678901')).toBe('+4420712345678901');
  });

  it('handles +1 with spaces: +1 604 555 1234', () => {
    expect(formatPhoneNumber('+1 604 555 1234')).toBe('+1 (604) 555-1234');
  });
});


describe('getInitials', () => {
  it('returns two initials from full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first and last initial for 3+ word names', () => {
    expect(getInitials('John Michael Doe')).toBe('JD');
  });

  it('returns first two chars for single name', () => {
    expect(getInitials('John')).toBe('JO');
  });

  it('uppercases initials', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('falls back to email when no name', () => {
    expect(getInitials(null, 'john@example.com')).toBe('JO');
    expect(getInitials('', 'ab@test.com')).toBe('AB');
  });

  it('returns "U" when no name and no email', () => {
    expect(getInitials(null, null)).toBe('U');
    expect(getInitials(undefined, undefined)).toBe('U');
  });

  it('returns "U" for empty strings', () => {
    expect(getInitials('', '')).toBe('U');
  });

  it('handles single-char name', () => {
    expect(getInitials('A')).toBe('A');
  });

  it('handles name with email fallback unused', () => {
    expect(getInitials('Jane Smith', 'jane@test.com')).toBe('JS');
  });
});
