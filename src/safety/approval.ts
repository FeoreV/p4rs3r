import { createInterface } from 'node:readline';
import { ApplicationQueueItem, NormalizedJob } from '../domain/types.js';

export async function promptHumanConfirmation(job: NormalizedJob, queueItem: ApplicationQueueItem): Promise<boolean> {
  console.log('\n======================================================');
  console.log(`[REVIEW APPROVAL REQUIRED] Job #${job.id}: ${job.title} @ ${job.company}`);
  console.log(`URL: ${job.canonicalUrl}`);
  console.log(`Match Score: ${queueItem.score}/100 | Source: ${job.source}`);
  console.log(`Cover Letter Draft (${queueItem.coverLetterTone ?? 'neutral'} tone):\n`);
  console.log(queueItem.coverLetterText);
  console.log('======================================================');

  if (process.env.NODE_ENV === 'test' || !process.stdin.isTTY) {
    console.log('Non-interactive environment detected. Auto-approving for CLI review mode.');
    return true;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Approve application submission? (y/N): ', (answer) => {
      rl.close();
      const approved = answer.trim().toLowerCase() === 'y';
      resolve(approved);
    });
  });
}
