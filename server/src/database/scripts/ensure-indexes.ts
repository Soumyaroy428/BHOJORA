import { applyInitialIndexes } from '../indexes';
import { runDatabaseCliTask } from './cli-runner';

async function main(): Promise<void> {
  await runDatabaseCliTask('ensure-indexes', async ({ connection, logger }) => {
    if (!connection.db) {
      throw new Error('MongoDB native database handle is unavailable');
    }
    const result = await applyInitialIndexes(connection.db, logger);
    logger.info('cli.indexes.completed', { ...result });
  });
}

if (require.main === module) {
  void main();
}
