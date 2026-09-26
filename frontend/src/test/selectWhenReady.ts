import { screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Selects an option once asynchronously loaded options are present. */
export async function selectWhenReady(user: UserEvent, label: string, value: string): Promise<void> {
  const select = await screen.findByLabelText(label);
  await waitFor(() => {
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.value);
    expect(options).toContain(value);
  });
  await user.selectOptions(select, value);
}
