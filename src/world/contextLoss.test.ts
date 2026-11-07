import { expect, test } from 'vitest';
import { useWorld } from '../app/state/world';
import { handleContextLost } from './contextLoss';

test('webgl context loss sets an error status', () => {
  useWorld.setState({ status: 'ready', error: null });
  handleContextLost();
  expect(useWorld.getState()).toMatchObject({ status: 'error' });
  expect(useWorld.getState().error).toContain('WebGL');
});
