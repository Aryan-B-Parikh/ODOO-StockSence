import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const products = await prisma.product.count();
  const warehouses = await prisma.warehouse.count();
  const ledger = await prisma.ledgerEntry.count();
  console.log({ users, products, warehouses, ledger });
  const allUsers = await prisma.user.findMany({ select: { email: true, name: true, role: true } });
  console.log('Users in DB:', allUsers);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
