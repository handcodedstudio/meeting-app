import { describe, it, expect } from 'vitest';
import { formatDuration, formatTimestamp, formatDate } from '../../../src/renderer/src/lib/time';

describe('formatDuration', () => {
  it('renders 0 as "0:00"', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('renders sub-minute values with leading zero seconds', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('renders 1:05 for 65 seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('renders 10:00 for 600 seconds', () => {
    expect(formatDuration(600)).toBe('10:00');
  });

  it('renders 1:01:01 for 3661 seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(65.9)).toBe('1:05');
  });

  it('coerces non-finite or negative inputs to "0:00"', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(-1)).toBe('0:00');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('formatTimestamp', () => {
  it('mirrors formatDuration', () => {
    expect(formatTimestamp(125)).toBe(formatDuration(125));
  });
});

describe('formatDate', () => {
  it('returns the original string when not parseable', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('returns a non-empty localised string for a valid ISO date', () => {
    const out = formatDate('2026-04-28T00:00:00.000Z');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe('Invalid Date');
  });
});
