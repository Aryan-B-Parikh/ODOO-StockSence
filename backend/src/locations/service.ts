import type { PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  locationCreateSchema,
  locationQuerySchema,
  locationUpdateSchema,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  type LocationSummary,
  type WarehouseSummary,
} from '@stocksense/shared';
import { ApiError } from '../lib/errors.js';

function toWarehouseSummary(warehouse: {
  id: string;
  name: string;
  shortCode: string;
  address: string | null;
}): WarehouseSummary {
  return {
    id: warehouse.id,
    name: warehouse.name,
    shortCode: warehouse.shortCode,
    address: warehouse.address,
  };
}

function toLocationSummary(location: {
  id: string;
  warehouseId: string;
  name: string;
  shortCode: string;
}): LocationSummary {
  return {
    id: location.id,
    warehouseId: location.warehouseId,
    name: location.name,
    shortCode: location.shortCode,
  };
}

/** 05_API_CONTRACTS.md §4 — Warehouses & Locations (owner: Person 1). */
export class LocationsService {
  constructor(private readonly prisma: PrismaClient) {}

  async listWarehouses(): Promise<WarehouseSummary[]> {
    const rows = await this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toWarehouseSummary);
  }

  async createWarehouse(input: unknown): Promise<WarehouseSummary> {
    const parsed = warehouseCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid warehouse details', collectFieldErrors(parsed.error));
    }

    const duplicate = await this.prisma.warehouse.findUnique({
      where: { shortCode: parsed.data.shortCode },
    });
    if (duplicate) {
      throw ApiError.validation('Short Code already in use', { shortCode: 'Short Code already in use' });
    }

    const warehouse = await this.prisma.warehouse.create({
      data: {
        name: parsed.data.name,
        shortCode: parsed.data.shortCode,
        address: parsed.data.address ?? null,
      },
    });
    return toWarehouseSummary(warehouse);
  }

  async updateWarehouse(id: string, input: unknown): Promise<WarehouseSummary> {
    const parsed = warehouseUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid warehouse details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const existing = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound('Warehouse not found');
    }

    if (data.shortCode && data.shortCode !== existing.shortCode) {
      const duplicate = await this.prisma.warehouse.findUnique({ where: { shortCode: data.shortCode } });
      if (duplicate) {
        throw ApiError.validation('Short Code already in use', { shortCode: 'Short Code already in use' });
      }
    }

    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.shortCode !== undefined ? { shortCode: data.shortCode } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
      },
    });
    return toWarehouseSummary(warehouse);
  }

  async listLocations(query: unknown): Promise<LocationSummary[]> {
    const parsed = locationQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid location query', collectFieldErrors(parsed.error));
    }

    const rows = await this.prisma.location.findMany({
      where: parsed.data.warehouseId ? { warehouseId: parsed.data.warehouseId } : {},
      orderBy: [{ warehouse: { name: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(toLocationSummary);
  }

  async createLocation(input: unknown): Promise<LocationSummary> {
    const parsed = locationCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid location details', collectFieldErrors(parsed.error));
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: parsed.data.warehouseId } });
    if (!warehouse) {
      throw ApiError.validation('Warehouse not found', { warehouseId: 'Warehouse not found' });
    }

    const duplicate = await this.prisma.location.findUnique({
      where: {
        warehouseId_shortCode: {
          warehouseId: parsed.data.warehouseId,
          shortCode: parsed.data.shortCode,
        },
      },
    });
    if (duplicate) {
      throw ApiError.validation('Short Code already in use in this warehouse', {
        shortCode: 'Short Code already in use in this warehouse',
      });
    }

    const location = await this.prisma.location.create({
      data: {
        warehouseId: parsed.data.warehouseId,
        name: parsed.data.name,
        shortCode: parsed.data.shortCode,
      },
    });
    return toLocationSummary(location);
  }

  /** BR29 — the warehouse is immutable after creation (enforced by the shared schema). */
  async updateLocation(id: string, input: unknown): Promise<LocationSummary> {
    const parsed = locationUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid location details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const existing = await this.prisma.location.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound('Location not found');
    }

    if (data.shortCode && data.shortCode !== existing.shortCode) {
      const duplicate = await this.prisma.location.findUnique({
        where: {
          warehouseId_shortCode: { warehouseId: existing.warehouseId, shortCode: data.shortCode },
        },
      });
      if (duplicate) {
        throw ApiError.validation('Short Code already in use in this warehouse', {
          shortCode: 'Short Code already in use in this warehouse',
        });
      }
    }

    const location = await this.prisma.location.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.shortCode !== undefined ? { shortCode: data.shortCode } : {}),
      },
    });
    return toLocationSummary(location);
  }
}
