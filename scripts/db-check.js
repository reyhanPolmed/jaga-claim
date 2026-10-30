const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();
  try {
    console.log('Connecting to PostgreSQL database via Prisma...');
    const result = await prisma.$queryRaw`SELECT NOW() as current_time, current_database() as db_name;`;
    console.log(`Database connected successfully! Connected to: ${result[0].db_name} at ${result[0].current_time}`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
