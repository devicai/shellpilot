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
 * Unique index for an external-identity binding (`externalUserId`), scoped by any
 * configured scope extensions (e.g. a `clientUID` tenant key) that apply to the
 * entity. Call AFTER applyExtensions so the scope fields already exist.
 *
 * - Standalone (no extensions): unique on `externalUserId` alone.
 * - With a tenant extension: unique on `(<scope...>, externalUserId)` — the same
 *   external user id can exist once per tenant.
 *
 * A `partialFilterExpression` restricts uniqueness to documents that actually
 * carry an `externalUserId`, so purely local users (which never set it) are not
 * indexed and cannot collide on a missing value.
 */
export function applyExternalIdentityIndex(
  schema: Schema,
  entityName: string,
  extensions: ExtensionProperty[],
): void {
  const keys: Record<string, 1> = {};
  for (const ext of extensions) {
    if (appliesTo(ext, entityName)) keys[ext.name] = 1;
  }
  keys.externalUserId = 1;

  schema.index(keys, {
    unique: true,
    partialFilterExpression: { externalUserId: { $exists: true } },
    name: 'externalUserId_scoped_unique',
  });
}
