import { describe, expect, it } from 'vitest';
import { getNavigation } from './navigation';

describe('Phase 0 navigation', () => {
  it('shows only the available dashboard route', () => {
    const groups = getNavigation('admin');
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(['/']);
  });
});
