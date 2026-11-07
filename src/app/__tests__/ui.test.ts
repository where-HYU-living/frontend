import { beforeEach, expect, test } from 'vitest';
import { useUi } from '../state/ui';

beforeEach(() => useUi.setState({ tab: 'home', panelOpen: false }));

test('selecting a tab opens its panel', () => {
  useUi.getState().selectTab('dorm');
  expect(useUi.getState()).toMatchObject({ tab: 'dorm', panelOpen: true });
});

test('selecting the open tab again folds the panel', () => {
  useUi.getState().selectTab('dorm');
  useUi.getState().selectTab('dorm');
  expect(useUi.getState()).toMatchObject({ tab: 'dorm', panelOpen: false });
});

test('selecting another tab while open switches without folding', () => {
  useUi.getState().selectTab('dorm');
  useUi.getState().selectTab('housing');
  expect(useUi.getState()).toMatchObject({ tab: 'housing', panelOpen: true });
});
