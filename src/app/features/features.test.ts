import { expect, test } from 'vitest';
import { buildListingParams, NO_FILTERS } from './listings';
import { useSession } from '../state/session';

test('buildListingParams converts 만원 to 원 and omits empty', () => {
  expect(buildListingParams({ ...NO_FILTERS, maxRentMan: '60' }).maxRent).toBe(600000);
  expect(buildListingParams({ ...NO_FILTERS, maxDepositMan: '1000' }).maxDeposit).toBe(10000000);
  expect(buildListingParams({ ...NO_FILTERS, maxMgmtMan: '7.5' }).maxMgmtFee).toBe(75000);
  const p = buildListingParams(NO_FILTERS);
  expect(p.maxRent).toBeUndefined();
  expect(p.maxDeposit).toBeUndefined();
  expect(buildListingParams({ ...NO_FILTERS, maxRentMan: 'abc' }).maxRent).toBeUndefined();
});

test('requireLogin opens the modal for guests only', () => {
  useSession.setState({ token: null, loginOpen: false });
  expect(useSession.getState().requireLogin()).toBe(false);
  expect(useSession.getState().loginOpen).toBe(true);
  useSession.setState({ token: 't', loginOpen: false });
  expect(useSession.getState().requireLogin()).toBe(true);
  expect(useSession.getState().loginOpen).toBe(false);
});
