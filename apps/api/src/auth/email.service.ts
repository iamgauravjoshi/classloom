import { Injectable, Inject, Optional } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AuthConfiguration } from './auth.service.js';
import { AUTH_CONFIG } from './auth.constants.js';

@Injectable()
export class EmailService {
  private readonly transport: Pick<Transporter, 'sendMail'>;

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
    @Optional() transport?: Pick<Transporter, 'sendMail'>,
  ) {
    const smtp = config.smtp;
    this.transport = transport ?? createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTls,
      ...(smtp.username && smtp.password ? { auth: { user: smtp.username, pass: smtp.password } } : {}),
    });
  }

  async sendInvitation(email: string, rawToken: string): Promise<void> {
    const link = new URL('/accept-invitation', this.config.webOrigin);
    link.searchParams.set('token', rawToken);
    await this.deliver(email, 'Your ClassLoom invitation',
      `Accept your ClassLoom invitation: ${link.toString()}`);
  }

  async sendPasswordReset(email: string, rawToken: string): Promise<void> {
    const link = new URL('/reset-password', this.config.webOrigin);
    link.searchParams.set('token', rawToken);
    await this.deliver(email, 'Reset your ClassLoom password',
      `Reset your ClassLoom password: ${link.toString()}`);
  }

  private async deliver(email: string, subject: string, text: string): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.config.smtp.from,
        to: email,
        subject,
        text,
        html: `<p>${text}</p>`,
      });
    } catch {
      throw new Error('Email delivery failed');
    }
  }
}
