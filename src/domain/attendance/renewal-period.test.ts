import { expect, it } from 'vitest';
import { renewalPeriod } from './renewal-period';
it('preserves paid days when extending an active membership', () => {
  expect(renewalPeriod(30, '2026-10-01', '2026-10-25', new Date('2026-10-05T17:00:00Z'))).toEqual({startDate: '2026-10-01', endDate: '2026-11-24'});
});
it('starts an expired membership on the current Lima calendar day', () => {
  expect(renewalPeriod(30, '2026-09-01', '2026-10-03', new Date('2026-10-05T04:50:00Z'))).toEqual({startDate: '2026-10-04', endDate: '2026-11-03'});
});
it('keeps the last paid day and handles leap years', () => {
  expect(renewalPeriod(1, '2028-02-01', '2028-02-28', new Date('2028-02-28T17:00:00Z'))).toEqual({startDate: '2028-02-01', endDate: '2028-02-29'});
});
