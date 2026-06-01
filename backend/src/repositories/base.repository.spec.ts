import { BaseRepository } from './base.repository';
import { ExtensionProperty } from '../config/config.types';

const CLIENT_UID: ExtensionProperty = {
  name: 'clientUID',
  type: 'string',
  required: true,
  index: true,
  entities: '*',
  source: 'header',
  headerName: 'x-client-uid',
};

interface Calls {
  find: unknown[];
  findOne: unknown[];
  countDocuments: unknown[];
  create: unknown[];
  findOneAndUpdate: unknown[];
  deleteOne: unknown[];
}

function makeModel() {
  const calls: Calls = { find: [], findOne: [], countDocuments: [], create: [], findOneAndUpdate: [], deleteOne: [] };
  const chain = (result: unknown) => {
    const self: Record<string, unknown> = {
      sort: () => self,
      skip: () => self,
      limit: () => self,
      lean: () => self,
      exec: async () => result,
    };
    return self;
  };
  const model = {
    calls,
    find: (f: unknown) => {
      calls.find.push(f);
      return chain([]);
    },
    findOne: (f: unknown) => {
      calls.findOne.push(f);
      return chain(null);
    },
    countDocuments: (f: unknown) => {
      calls.countDocuments.push(f);
      return chain(0);
    },
    create: async (d: unknown) => {
      calls.create.push(d);
      return d;
    },
    findOneAndUpdate: (f: unknown) => {
      calls.findOneAndUpdate.push(f);
      return chain(null);
    },
    deleteOne: (f: unknown) => {
      calls.deleteOne.push(f);
      return chain({ deletedCount: 1 });
    },
  };
  return model;
}

class TestRepo extends BaseRepository<Record<string, unknown>> {
  constructor(model: ReturnType<typeof makeModel>, ext: ExtensionProperty[]) {
    super(model as never, 'Widget', ext);
  }
}

describe('BaseRepository scoping', () => {
  it('adds the extension value to read and count filters', async () => {
    const model = makeModel();
    const repo = new TestRepo(model, [CLIENT_UID]);
    await repo.find({ name: 'x' }, { clientUID: 'acme' });
    expect(model.calls.find[0]).toEqual({ name: 'x', clientUID: 'acme' });
    expect(model.calls.countDocuments[0]).toEqual({ name: 'x', clientUID: 'acme' });
  });

  it('stamps the extension value on create', async () => {
    const model = makeModel();
    const repo = new TestRepo(model, [CLIENT_UID]);
    await repo.create({ name: 'x' }, { clientUID: 'acme' });
    expect(model.calls.create[0]).toEqual({ name: 'x', clientUID: 'acme' });
  });

  it('scopes updates and deletes', async () => {
    const model = makeModel();
    const repo = new TestRepo(model, [CLIENT_UID]);
    await repo.updateOne({ name: 'x' }, { $set: { name: 'y' } }, { clientUID: 'acme' });
    await repo.deleteOne({ name: 'x' }, { clientUID: 'acme' });
    expect(model.calls.findOneAndUpdate[0]).toEqual({ name: 'x', clientUID: 'acme' });
    expect(model.calls.deleteOne[0]).toEqual({ name: 'x', clientUID: 'acme' });
  });

  it('does not scope when no extensions are configured (standalone unchanged)', async () => {
    const model = makeModel();
    const repo = new TestRepo(model, []);
    await repo.findOne({ name: 'x' }, { clientUID: 'acme' });
    expect(model.calls.findOne[0]).toEqual({ name: 'x' });
  });

  it('only scopes entities the extension applies to', async () => {
    const scopedToOther: ExtensionProperty = { ...CLIENT_UID, entities: ['Other'] };
    const model = makeModel();
    const repo = new TestRepo(model, [scopedToOther]);
    await repo.findOne({ name: 'x' }, { clientUID: 'acme' });
    // 'Widget' is not in ['Other'] → filter stays unscoped.
    expect(model.calls.findOne[0]).toEqual({ name: 'x' });
  });
});
