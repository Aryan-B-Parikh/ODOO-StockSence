import { Prisma, type PrismaClient } from '@prisma/client';
import {
  categoryCreateSchema,
  collectFieldErrors,
  productCreateSchema,
  productQuerySchema,
  productUpdateSchema,
  type CategorySummary,
  type Paginated,
  type ProductSummary,
} from '@stocksense/shared';
import { ApiError } from '../lib/errors.js';
import { applyStockAdjustment } from '../stock-engine/adjustment.js';
import type { ReferenceGenerator, StockEngine } from '../stock-engine/interface.js';

type ProductWithCategory = Prisma.ProductGetPayload<{ include: { category: true } }>;

function toProductSummary(product: ProductWithCategory): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    uom: product.uom,
    costPerUnit: product.costPerUnit?.toNumber() ?? null,
    reorderMin: product.reorderMin?.toNumber() ?? null,
    reorderMax: product.reorderMax?.toNumber() ?? null,
  };
}

/** 05_API_CONTRACTS.md §2 — Products & Categories (owner: Person 1). */
export class CatalogService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: StockEngine,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  async listProducts(query: unknown): Promise<Paginated<ProductSummary>> {
    const parsed = productQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid product query', collectFieldErrors(parsed.error));
    }
    const { search, categoryId, page, pageSize } = parsed.data;

    const where: Prisma.ProductWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: [{ name: 'asc' }, { sku: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map(toProductSummary), total, page, pageSize };
  }

  /** R4.1/R4.5 + BR27/BR28; optional initial stock writes an ADJUSTMENT via the stock-engine. */
  async createProduct(input: unknown, responsibleUserId: string): Promise<ProductSummary> {
    const parsed = productCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid product details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      if (data.categoryId) {
        const category = await tx.category.findUnique({ where: { id: data.categoryId } });
        if (!category) {
          throw ApiError.validation('Category not found', { categoryId: 'Category not found' });
        }
      }

      const duplicate = await tx.product.findUnique({ where: { sku: data.sku } });
      if (duplicate) {
        throw ApiError.validation('SKU already in use', { sku: 'SKU already in use' });
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          sku: data.sku,
          categoryId: data.categoryId ?? null,
          uom: data.uom,
          costPerUnit: data.costPerUnit ?? null,
          reorderMin: data.reorderMin ?? null,
          reorderMax: data.reorderMax ?? null,
        },
        include: { category: true },
      });

      if (data.initialStock) {
        await applyStockAdjustment(tx, this.engine, this.referenceGenerator, {
          productId: product.id,
          locationId: data.initialStock.locationId,
          countedQuantity: data.initialStock.quantity,
          note: 'Initial stock',
          responsibleUserId,
        });
      }

      return toProductSummary(product);
    });
  }

  /** R4.2 — partial update; `initialStock` is create-only per 05 §2. */
  async updateProduct(id: string, input: unknown): Promise<ProductSummary> {
    const parsed = productUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid product details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) {
        throw ApiError.notFound('Product not found');
      }

      if (data.categoryId) {
        const category = await tx.category.findUnique({ where: { id: data.categoryId } });
        if (!category) {
          throw ApiError.validation('Category not found', { categoryId: 'Category not found' });
        }
      }

      if (data.sku && data.sku !== existing.sku) {
        const duplicate = await tx.product.findUnique({ where: { sku: data.sku } });
        if (duplicate) {
          throw ApiError.validation('SKU already in use', { sku: 'SKU already in use' });
        }
      }

      const product = await tx.product.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.sku !== undefined ? { sku: data.sku } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId ?? null } : {}),
          ...(data.uom !== undefined ? { uom: data.uom } : {}),
          ...(data.costPerUnit !== undefined ? { costPerUnit: data.costPerUnit ?? null } : {}),
          ...(data.reorderMin !== undefined ? { reorderMin: data.reorderMin ?? null } : {}),
          ...(data.reorderMax !== undefined ? { reorderMax: data.reorderMax ?? null } : {}),
        },
        include: { category: true },
      });

      return toProductSummary(product);
    });
  }

  async listCategories(): Promise<CategorySummary[]> {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return rows.map((category) => ({ id: category.id, name: category.name }));
  }

  async createCategory(input: unknown): Promise<CategorySummary> {
    const parsed = categoryCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid category details', collectFieldErrors(parsed.error));
    }

    const duplicate = await this.prisma.category.findUnique({ where: { name: parsed.data.name } });
    if (duplicate) {
      throw ApiError.validation('Category already exists', { name: 'Category already exists' });
    }

    const category = await this.prisma.category.create({ data: { name: parsed.data.name } });
    return { id: category.id, name: category.name };
  }
}
