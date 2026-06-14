/**
 * Backfill an entity-extension field across an already-populated database.
 *
 * When you turn on a `required: true` extension property (e.g. a tenant scope),
 * existing documents written before activation have no value for it and would
 * become invisible to scoped reads. Run this ONCE, before flipping the extension
 * to required, to stamp every existing document with a value.
 *
 * Idempotent: only documents missing the field are touched, and the script exits
 * non-zero unless every collection ends up fully backfilled.
 *
 * Usage:
 *   npx ts-node scripts/backfill-extension.ts <field> <value> [collection ...]
 *
 * Examples:
 *   npx ts-node scripts/backfill-extension.ts clientUID default
 *   npx ts-node scripts/backfill-extension.ts clientUID acme-prod users apikeys
 *
 * The Mongo connection is read from config.yml (database.uri), same as the app.
 */
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/config.loader';

async function main(): Promise<void> {
  const [field, value, ...collectionArgs] = process.argv.slice(2);
  if (!field || value === undefined) {
    // eslint-disable-next-line no-console
    console.error('Usage: backfill-extension.ts <field> <value> [collection ...]');
    process.exit(2);
  }

  const config = loadConfig();
  await mongoose.connect(config.database.uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  // Default to every collection in the DB — generic, deployer-agnostic. A caller
  // can narrow to specific collections by listing them.
  const allCollections = (await db.listCollections().toArray()).map((c) => c.name);
  const targets =
    collectionArgs.length > 0
      ? collectionArgs.filter((c) => allCollections.includes(c))
      : allCollections;

  let totalUpdated = 0;
  let totalRemaining = 0;

  for (const name of targets) {
    const coll = db.collection(name);
    const res = await coll.updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
    const remaining = await coll.countDocuments({ [field]: { $exists: false } });
    totalUpdated += res.modifiedCount ?? 0;
    totalRemaining += remaining;
    // eslint-disable-next-line no-console
    console.log(
      `  ${name}: set ${res.modifiedCount ?? 0} document(s); ${remaining} still missing '${field}'`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`\nBackfill '${field}=${value}': updated ${totalUpdated}, remaining ${totalRemaining}`);

  await mongoose.disconnect();

  if (totalRemaining > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `Refusing to report success: ${totalRemaining} document(s) still lack '${field}'. ` +
        'Do NOT enable the required extension until this is 0.',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Backfill failed:', err);
  process.exit(1);
});
