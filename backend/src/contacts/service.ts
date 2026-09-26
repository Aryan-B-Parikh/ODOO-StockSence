import type { Prisma, PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  contactCreateSchema,
  contactQuerySchema,
  type ContactSummary,
} from '@stocksense/shared';
import { ApiError } from '../lib/errors.js';

function toContactSummary(contact: {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
}): ContactSummary {
  return {
    id: contact.id,
    name: contact.name,
    type: contact.type as ContactSummary['type'],
    email: contact.email,
    phone: contact.phone,
  };
}

/** 05_API_CONTRACTS.md §4b — Contacts (Phase 3 addition, PHASE3_DECISIONS §4). */
export class ContactsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: unknown): Promise<ContactSummary[]> {
    const parsed = contactQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid contact query', collectFieldErrors(parsed.error));
    }
    const { type, search } = parsed.data;

    const where: Prisma.ContactWhereInput = {
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.contact.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map(toContactSummary);
  }

  async create(input: unknown): Promise<ContactSummary> {
    const parsed = contactCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid contact details', collectFieldErrors(parsed.error));
    }

    const contact = await this.prisma.contact.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
      },
    });
    return toContactSummary(contact);
  }
}
