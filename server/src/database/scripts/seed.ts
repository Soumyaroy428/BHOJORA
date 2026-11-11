import { runSeed } from '../seed';
import { runDatabaseCliTask } from './cli-runner';

async function main(): Promise<void> {
  await runDatabaseCliTask('seed', async ({ config, connection, logger }) => {
    if (!connection.db) {
      throw new Error('MongoDB native database handle is unavailable');
    }
    const allowProductionBootstrap = process.env['ALLOW_PRODUCTION_BOOTSTRAP_SEED'] === 'true';
    const result = await runSeed({
      db: connection.db,
      logger,
      nodeEnv: config.nodeEnv,
      allowProductionBootstrap,
    });
    logger.info('cli.seed.completed', { ...result });
  });
}

if (require.main === module) {
  void main();
}
