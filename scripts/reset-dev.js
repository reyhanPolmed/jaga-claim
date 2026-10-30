const { PrismaClient } = require('@prisma/client');

async function resetDevDatabase() {
  const env = process.env.NODE_ENV;
  if (!['development', 'test'].includes(env)) {
    console.error('CRITICAL: Database reset hanya diizinkan pada NODE_ENV development/test.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log(`Resetting development database (${env})...`);
    // Delete in child-to-parent order to respect foreign key constraints
    await prisma.review.deleteMany({});
    await prisma.riskFinding.deleteMany({});
    await prisma.prediction.deleteMany({});
    await prisma.scoringJobItem.deleteMany({});
    await prisma.scoringJob.deleteMany({});
    await prisma.claimRevision.deleteMany({});
    await prisma.claim.deleteMany({});
    await prisma.importBatch.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('Database reset completed successfully.');
  } catch (err) {
    console.error('Database reset gagal. Periksa koneksi dan migration tanpa mencetak detail credential.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetDevDatabase();
