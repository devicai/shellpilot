import * as yaml from 'js-yaml';
import { PolicyYamlService } from './policy-yaml.service';

const POLICY_ID = 'a'.repeat(24);

function makeService(opts: {
  policyClis?: string[];
  rules?: Array<{ cli?: string; path: string; effect: string }>;
  catalog?: Array<Record<string, unknown>>;
}) {
  const policies = {
    findById: jest.fn().mockResolvedValue({
      _id: POLICY_ID,
      defaultEffect: 'deny',
      enforcement: 'warn',
      clis: opts.policyClis ?? [],
    }),
    findActive: jest.fn(),
  };
  const rules = {
    findByPolicy: jest.fn().mockResolvedValue(opts.rules ?? []),
  };
  const resolution = { resolveEffectivePolicyId: jest.fn().mockResolvedValue(POLICY_ID) };
  const findExec = jest.fn().mockResolvedValue(opts.catalog ?? []);
  const cliModel = {
    find: jest.fn(() => ({ lean: () => ({ exec: findExec }) })),
  };
  const svc = new PolicyYamlService(policies as never, rules as never, resolution as never, cliModel as never);
  return { svc, cliModel };
}

describe('PolicyYamlService CLI catalog selection', () => {
  const suntropyDoc = {
    slug: 'suntropy',
    active: true,
    installCommands: { linux: 'npm install -g @enerlence/suntropy-cli' },
    auth: { mode: 'env_var', envVar: 'SUNTROPY_API_KEY' },
  };

  it('includes CLIs referenced only by rules (empty policy.clis)', async () => {
    const { svc, cliModel } = makeService({
      policyClis: [],
      rules: [{ cli: 'suntropy', path: 'suntropy delete *', effect: 'deny' }],
      catalog: [suntropyDoc],
    });
    const doc = yaml.load(await svc.compilePolicyYaml(POLICY_ID)) as any;

    expect(cliModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ slug: { $in: ['suntropy'] }, active: true }),
    );
    expect(doc.clis.suntropy.install.linux).toBe('npm install -g @enerlence/suntropy-cli');
    expect(doc.clis.suntropy.auth.env_var).toBe('SUNTROPY_API_KEY');
  });

  it('unions policy.clis with rule CLIs without duplicates', async () => {
    const { svc, cliModel } = makeService({
      policyClis: ['devic', 'suntropy'],
      rules: [
        { cli: 'suntropy', path: 'suntropy delete *', effect: 'deny' },
        { cli: 'gh', path: 'gh repo delete *', effect: 'deny' },
        { path: '* --force', effect: 'deny' }, // ruleless-cli entry is ignored
      ],
      catalog: [suntropyDoc],
    });
    await svc.compilePolicyYaml(POLICY_ID);

    const query = (cliModel.find as jest.Mock).mock.calls[0][0];
    expect([...query.slug.$in].sort()).toEqual(['devic', 'gh', 'suntropy']);
  });

  it('still emits an empty clis map when nothing is referenced', async () => {
    const { svc } = makeService({ policyClis: [], rules: [] });
    const doc = yaml.load(await svc.compilePolicyYaml(POLICY_ID)) as any;
    expect(doc.clis).toEqual({});
  });
});
