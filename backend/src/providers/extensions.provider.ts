import { Schema } from 'mongoose';
import { ExtensionProperty } from '../config/config.types';

export const EXTENSIONS_TOKEN = Symbol('EXTENSIONS');

const TYPE_MAP: Record<string, unknown> = {
  string: String,
  number: Number,
  boolean: Boolean,
  date: Date,
};

export function applyExtensions(
  schema: Schema,
  entityName: string,
  extensions: ExtensionProperty[],
): void {
  for (const ext of extensions) {
    if (!appliesTo(ext, entityName)) continue;

    schema.add({
      [ext.name]: {
        type: TYPE_MAP[ext.type] ?? String,
        required: ext.required ?? false,
        index: ext.index ?? false,
      },
    });
  }
}

function appliesTo(ext: ExtensionProperty, entityName: string): boolean {
  return (
    ext.entities === '*' ||
    (Array.isArray(ext.entities) && ext.entities.includes(entityName))
  );
}

/**
 * Build a unique index on `field`, scoped by any configured scope extensions
 * (e.g. a `clientUID` tenant key) that apply to the entity. Call AFTER
 * applyExtensions so the scope fields already exist on the schema.
 *
 * - Standalone (no extensions): unique on `field` alone — identical to a plain
 *   `@Prop({ unique: true })`.
 * - With a tenant extension: unique on `(<scope...>, field)` — the same value can
 *   exist once per tenant.
 *
 * `opts.partial` restricts uniqueness to documents that actually carry the field
 * (`{ [field]: { $exists: true } }`), so optional fields don't collide on a
 * missing value. Omit it for `required` fields, which always have a value.
 */
export function applyScopedUniqueIndex(
  schema: Schema,
  entityName: string,
  extensions: ExtensionProperty[],
  field: string,
  opts: { name: string; partial?: boolean },
): void {
  const keys: Record<string, 1> = {};
  for (const ext of extensions) {
    if (appliesTo(ext, entityName)) keys[ext.name] = 1;
  }
  keys[field] = 1;

  const indexOptions: Record<string, unknown> = { unique: true, name: opts.name };
  if (opts.partial) {
    indexOptions.partialFilterExpression = { [field]: { $exists: true } };
  }
  schema.index(keys, indexOptions);
}

/**
 * Unique index for an external-identity binding (`externalUserId`), scoped per
 * tenant. Thin wrapper over {@link applyScopedUniqueIndex}: partial so purely
 * local users (which never set `externalUserId`) are not indexed.
 */
export function applyExternalIdentityIndex(
  schema: Schema,
  entityName: string,
  extensions: ExtensionProperty[],
): void {
  applyScopedUniqueIndex(schema, entityName, extensions, 'externalUserId', {
    name: 'externalUserId_scoped_unique',
    partial: true,
  });
}
