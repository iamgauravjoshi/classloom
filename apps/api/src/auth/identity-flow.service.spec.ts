import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env.js';
import { AuthRepository } from './auth.repository.js';
import { EmailService } from './email.service.js';
import { IdentityFlowService } from './identity-flow.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const config=parseEnv({DATABASE_URL:'postgresql://localhost/classloom_test'});
describe('IdentityFlowService',()=>{
  let repository: Record<string,ReturnType<typeof vi.fn>>;
  let passwords:{hash:ReturnType<typeof vi.fn>};
  let email:{sendInvitation:ReturnType<typeof vi.fn>;sendPasswordReset:ReturnType<typeof vi.fn>};
  let service:IdentityFlowService;
  beforeEach(()=>{
    repository={
      consumeRateLimit:vi.fn().mockResolvedValue({allowed:true}),
      isPasswordResetTokenValid:vi.fn().mockResolvedValue(false),
      consumePasswordReset:vi.fn().mockResolvedValue(true),
      recordSecurityEvent:vi.fn().mockResolvedValue(undefined),
      findAccountCredentialByEmail:vi.fn(),createPasswordReset:vi.fn().mockResolvedValue(undefined),
      selectSessionMembership:vi.fn().mockResolvedValue(true),acceptExistingAccountInvitation:vi.fn(),
    };
    passwords={hash:vi.fn().mockResolvedValue('argon2id$updated')};
    email={sendInvitation:vi.fn(),sendPasswordReset:vi.fn().mockResolvedValue(undefined)};
    service=new IdentityFlowService(repository as unknown as AuthRepository,passwords as unknown as PasswordService,
      new TokenService(),email as unknown as EmailService,config);
  });

  it('rejects invalid reset tokens before starting Argon2 work',async()=>{
    const token=new TokenService().createOpaqueToken();
    await expect(service.confirmPasswordReset(token.raw,'a new secure password phrase','request','127.0.0.1'))
      .rejects.toMatchObject({status:400});
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({scope:'reset-confirm'}));
    expect(repository.isPasswordResetTokenValid).toHaveBeenCalled();
    expect(passwords.hash).not.toHaveBeenCalled();
  });

  it('does not await reset email delivery in the public request response',async()=>{
    let release!:()=>void;
    email.sendPasswordReset.mockImplementation(()=>new Promise<void>((resolve)=>{release=resolve;}));
    repository.findAccountCredentialByEmail.mockResolvedValue({account:{id:'account-1',status:'active'},credential:{}});
    const request=service.requestPasswordReset('user@example.test','127.0.0.1','request-1');
    const response=await request;
    expect(response).toEqual({accepted:true});
    await vi.waitFor(()=>expect(email.sendPasswordReset).toHaveBeenCalledOnce());
    release();
  });

  it('applies the shared invitation limit to authenticated acceptance attempts',async()=>{
    repository.consumeRateLimit.mockResolvedValue({allowed:false});
    await expect(service.acceptExistingInvitation('opaque-token','account-1','session-1','127.0.0.1'))
      .rejects.toMatchObject({status:400});
    expect(repository.acceptExistingAccountInvitation).not.toHaveBeenCalled();
  });
});
