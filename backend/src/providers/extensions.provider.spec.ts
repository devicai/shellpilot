import { Schema } from 'mongoose';
import {
  applyExtensions,
  applyExternalIdentityIndex,
  applyScopedUniqueIndex,
} from './extensions.provider';
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

function findIndex(schema: Schema, name: string) {
  return schema.indexes().find(([, opts]) => (opts as { name?: string }).name === name);
}

describe('applyExternalIdentityIndex', () => {
  it('indexes externalUserId alone in standalone mode, partial + unique', () => {
    const schema = new Schema({ externalUserId: String });
    applyExternalIdentityIndex(schema, 'User', []);
    const idx = findIndex(schema, 'externalUserId_scoped_unique');
    expect(idx).toBeDefined();
    const [keys, opts] = idx!;
    expect(keys).toEqual({ externalUserId: 1 });
    expect(opts).toMatchObject({
      unique: true,
      partialFilterExpression: { externalUserId: { $exists: true } },
    });
  });

  it('prefixes the index with applicable scope extensions (per-tenant uniqueness)', () => {
    const schema = new Schema({ externalUserId: String });
    applyExtensions(schema, 'User', [CLIENT_UID]);
    applyExternalIdentityIndex(schema, 'User', [CLIENT_UID]);
    const [keys] = findIndex(schema, 'externalUserId_scoped_unique')!;
    expect(keys).toEqual({ clientUID: 1, externalUserId: 1 });
  });

  it('omits extensions that do not apply to the entity', () => {
    const otherOnly: ExtensionProperty = { ...CLIENT_UID, entities: ['Trace'] };
    const schema = new Schema({ externalUserId: String });
    applyExternalIdentityIndex(schema, 'User', [otherOnly]);
    const [keys] = findIndex(schema, 'externalUserId_scoped_unique')!;
    expect(keys).toEqual({ externalUserId: 1 });
  });
});

describe('applyScopedUniqueIndex', () => {
  it('indexes the field alone in standalone mode, unique without partial', () => {
    const schema = new Schema({ slug: String });
    applyScopedUniqueIndex(schema, 'Cli', [], 'slug', { name: 'slug_scoped_unique' });
    const idx = findIndex(schema, 'slug_scoped_unique');
    expect(idx).toBeDefined();
    const [keys, opts] = idx!;
    expect(keys).toEqual({ slug: 1 });
    expect(opts).toMatchObject({ unique: true });
    expect((opts as { partialFilterExpression?: unknown }).partialFilterExpression).toBeUndefined();
  });

  it('prefixes the index with applicable scope extensions (per-tenant uniqueness)', () => {
    const schema = new Schema({ slug: String });
    applyExtensions(schema, 'Cli', [CLIENT_UID]);
    applyScopedUniqueIndex(schema, 'Cli', [CLIENT_UID], 'slug', { name: 'slug_scoped_unique' });
    const [keys, opts] = findIndex(schema, 'slug_scoped_unique')!;
    expect(keys).toEqual({ clientUID: 1, slug: 1 });
    expect(opts).toMatchObject({ unique: true });
  });

  it('adds a partial filter expression when opts.partial is set', () => {
    const schema = new Schema({ externalUserId: String });
    applyScopedUniqueIndex(schema, 'User', [], 'externalUserId', {
      name: 'externalUserId_scoped_unique',
      partial: true,
    });
    const [, opts] = findIndex(schema, 'externalUserId_scoped_unique')!;
    expect(opts).toMatchObject({
      unique: true,
      partialFilterExpression: { externalUserId: { $exists: true } },
    });
  });
});
