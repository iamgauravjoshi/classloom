import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env.js';
import { EmailService } from './email.service.js';

const config = parseEnv({ DATABASE_URL: 'postgresql://localhost/test' });

describe('EmailService', () => {
  it('sends invitation and reset links through the provider-neutral sender', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'mail-id' });
    const email = new EmailService(config, { sendMail });

    await email.sendInvitation('staff@example.test', 'opaque-invitation-token');
    await email.sendPasswordReset('staff@example.test', 'opaque-reset-token');

    expect(sendMail).toHaveBeenNthCalledWith(1, expect.objectContaining({
      to: 'staff@example.test',
      from: config.smtp.from,
      subject: expect.stringMatching(/invitation/i),
      html: expect.stringContaining('token=opaque-invitation-token'),
    }));
    expect(sendMail).toHaveBeenNthCalledWith(2, expect.objectContaining({
      to: 'staff@example.test',
      subject: expect.stringMatching(/password/i),
      html: expect.stringContaining('token=opaque-reset-token'),
    }));
  });

  it('does not expose transport errors or the recipient token through a new error', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('SMTP refused recipient with token'));
    const email = new EmailService(config, { sendMail });

    await expect(email.sendInvitation('staff@example.test', 'opaque-token'))
      .rejects.toThrow('Email delivery failed');
  });
});
