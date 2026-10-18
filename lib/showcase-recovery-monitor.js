import { recoverShowcaseUploads } from './showcase-recovery.js';

// Preview-only observation. Never invoke destructive recovery from maintenance.
export async function observeShowcaseRecovery(pool, {
  env = process.env,
  recover = recoverShowcaseUploads,
  logger = console,
} = {}) {
  if (env.VERCEL_ENV !== 'preview') return { status: 'disabled' };
  try {
    const result = await recover(pool, { dryRun: true, limit: 5 });
    const summary = {
      status: result.locked ? 'locked' : 'observed',
      candidates: result.candidates,
      referenced: result.referenced,
      dryRun: true,
    };
    logger.info('Showcase recovery dry-run', summary);
    return summary;
  } catch {
    logger.error('Showcase recovery dry-run failed', { code: 'SHOWCASE_RECOVERY_OBSERVE_FAILED' });
    return { status: 'failed' };
  }
}
