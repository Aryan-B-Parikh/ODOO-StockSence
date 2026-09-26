import type { ReactNode } from 'react';
import type { ProductSummary } from '@stocksense/shared';

export interface EditableLine {
  productId: string;
  quantity: string;
}

interface DocumentLinesEditorProps {
  lines: EditableLine[];
  products: ProductSummary[];
  onChange: (lines: EditableLine[]) => void;
  readOnly?: boolean;
  error?: string;
  /** Optional per-row class (e.g. red rows for out-of-stock delivery lines, R6.11). */
  rowClass?: (index: number) => string | undefined;
  readOnlyStatus?: (index: number) => ReactNode;
}

/** Products table with quantity rows + "Add Product" (IMG:4/5 "New Product" row). */
export function DocumentLinesEditor({
  lines,
  products,
  onChange,
  readOnly = false,
  error,
  rowClass,
  readOnlyStatus,
}: DocumentLinesEditorProps) {
  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  if (readOnly) {
    return (
      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={2} className="muted">
                  No products
                </td>
              </tr>
            ) : (
              lines.map((line, index) => {
                const product = products.find((candidate) => candidate.id === line.productId);
                return (
                  <tr key={index} className={rowClass?.(index)}>
                    <td>
                      {product?.name ?? line.productId}
                      {readOnlyStatus?.(index)}
                    </td>
                    <td>{line.quantity}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="lines-editor">
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="quantity-col">Quantity</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className={rowClass?.(index)}>
              <td>
                <select
                  className="input"
                  aria-label={`Product for line ${index + 1}`}
                  value={line.productId}
                  onChange={(event) => updateLine(index, { productId: event.target.value })}
                >
                  <option value="">Select a product…</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
              </td>
              <td className="quantity-col">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input"
                  aria-label={`Quantity for line ${index + 1}`}
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
              </td>
              <td className="table-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-secondary add-line"
        onClick={() => onChange([...lines, { productId: '', quantity: '1' }])}
      >
        Add Product
      </button>
    </div>
  );
}
