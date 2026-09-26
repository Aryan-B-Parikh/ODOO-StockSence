import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductSummary } from '@stocksense/shared';
import { listCategories, listProducts } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateMessages';
import { ProductForm } from './ProductForm';

const PAGE_SIZE = 10;

/** Products — Catalog tab (R4.1-R4.5, R11.3 SKU search / category filter). */
export function CatalogTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductSummary | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products', { search, categoryId, page }],
    queryFn: () =>
      listProducts(token!, {
        search: search || undefined,
        categoryId: categoryId || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(token!),
    enabled: Boolean(token),
  });

  const invalidateInventory = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const openCreate = () => {
    setEditingProduct(null);
    setFormOpen(true);
  };

  const openEdit = (product: ProductSummary) => {
    setEditingProduct(product);
    setFormOpen(true);
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by name or SKU…"
            aria-label="Search products"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Filter by category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          New Product
        </button>
      </div>

      {productsQuery.isLoading && <LoadingState label="Loading products…" />}
      {productsQuery.isError && <ErrorState message="Could not load products." />}

      {productsQuery.data && (
        <>
          {productsQuery.data.data.length === 0 ? (
            <EmptyState message="No products yet. Create your first product." />
          ) : (
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Unit of Measure</th>
                    <th>Reorder Min / Max</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {productsQuery.data.data.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td className="mono">{product.sku}</td>
                      <td>{product.categoryName ?? <span className="muted">—</span>}</td>
                      <td>{product.uom}</td>
                      <td>
                        {product.reorderMin ?? '—'} / {product.reorderMax ?? '—'}
                      </td>
                      <td className="table-actions">
                        <button type="button" className="btn btn-small" onClick={() => openEdit(product)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={productsQuery.data.page}
            pageSize={productsQuery.data.pageSize}
            total={productsQuery.data.total}
            onPageChange={setPage}
          />
        </>
      )}

      {formOpen && (
        <ProductForm
          product={editingProduct}
          categories={categoriesQuery.data ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            invalidateInventory();
          }}
        />
      )}
    </>
  );
}
