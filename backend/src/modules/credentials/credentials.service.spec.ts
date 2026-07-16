import { ForbiddenException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';

const USER_ID = 'a'.repeat(24);

/**
 * Builds a CredentialsService with plain jest-mock collaborators (house style —
 * no Nest TestingModule). Only the deps `issue()` touches are meaningfully
 * stubbed; the rest are inert.
 */
function makeService(opts?: {
  decision?: 'allow' | 'deny' | 'requires-approval';
  enforcement?: 'enforce' | 'warn' | 'audit';
  profileClis?: string[];
}) {
  const repo = {
    findForUserAndCli: jest.fn().mockResolvedValue({
      mode: 'env',
      envVar: 'TOKEN',
      envelopeCiphertext: 'ct',
      envelopeIv: 'iv',
      envelopeTag: 'tag',
    }),
  };
  const cipher = { open: jest.fn().mockReturnValue('{"secret":"s3cr3t"}') };
  const jit = { issue: jest.fn().mockResolvedValue({ jitToken: 'jt-123', expiresIn: 60 }) };
  const clis = { findOne: jest.fn().mockResolvedValue({ auth: { mode: 'env', envVar: 'TOKEN' } }) };
  const postProcess = {};
  const traces = { ingest: jest.fn().mockResolvedValue(undefined) };
  const users = {
    findById: jest.fn().mockResolvedValue(
      opts?.profileClis ? { profileId: { toString: () => 'p1' } } : {},
    ),
  };
  const profiles = {
    findById: jest.fn().mockResolvedValue(opts?.profileClis ? { clis: opts.profileClis } : null),
  };
  const evaluator = {
    evaluate: jest.fn().mockResolvedValue({
      decision: opts?.decision ?? 'allow',
      enforcement: opts?.enforcement ?? 'enforce',
      matchedRule:
        (opts?.decision ?? 'allow') === 'allow'
          ? undefined
          : { id: 'r1', cli: 'suntropy', path: 'delete *', effect: 'deny', reason: 'Not enough permissions', priority: 0 },
      policy: { id: 'pol1', name: 'p', version: 1 },
    }),
  };

  const svc = new CredentialsService(
    repo as never,
    cipher as never,
    jit as never,
    clis as never,
    postProcess as never,
    traces as never,
    users as never,
    profiles as never,
    evaluator as never,
  );
  return { svc, repo, jit, traces, evaluator, profiles };
}

const dto = { userId: USER_ID, cli: 'suntropy', commandPath: ['delete', 'thing'] };

describe('CredentialsService.issue — server-side policy enforcement', () => {
  it('issues a JIT when the command is allowed', async () => {
    const { svc, jit, traces } = makeService({ decision: 'allow' });
    const res = await svc.issue(dto as never, {});
    expect(res).toEqual({ jitToken: 'jt-123', expiresIn: 60 });
    expect(jit.issue).toHaveBeenCalledTimes(1);
    // Only the jit-issued trace, no deny trace.
    expect(traces.ingest).toHaveBeenCalledTimes(1);
    expect(traces.ingest.mock.calls[0][0].decision).toBe('jit-issued');
  });

  it('blocks issuance with a policy-deny 403 when denied under an enforcing policy', async () => {
    const { svc, jit, traces } = makeService({ decision: 'deny', enforcement: 'enforce' });
    const err = await svc.issue(dto as never, {}).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err.getResponse() as { code: string }).code).toBe('policy-deny');
    // The real secret is never released.
    expect(jit.issue).not.toHaveBeenCalled();
    // The denied attempt is audited as a deny trace.
    expect(traces.ingest).toHaveBeenCalledTimes(1);
    expect(traces.ingest.mock.calls[0][0]).toMatchObject({ decision: 'deny', enforcement: 'enforce' });
  });

  it('audits but still issues when denied under a monitor policy (warn)', async () => {
    const { svc, jit, traces } = makeService({ decision: 'deny', enforcement: 'warn' });
    const res = await svc.issue(dto as never, {});
    expect(res.jitToken).toBe('jt-123');
    expect(jit.issue).toHaveBeenCalledTimes(1);
    // Both a deny (audit) trace and the jit-issued trace fire.
    const decisions = traces.ingest.mock.calls.map((c) => c[0].decision);
    expect(decisions).toEqual(expect.arrayContaining(['deny', 'jit-issued']));
  });

  it('still enforces the profile CLI allowlist before evaluating rules', async () => {
    const { svc, evaluator } = makeService({ profileClis: ['gh'] }); // suntropy not allowed
    await expect(svc.issue(dto as never, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(evaluator.evaluate).not.toHaveBeenCalled();
  });
});
