import { Fragment, type ReactNode } from 'react';

export interface KanbanColumn<T> {
  key: string;
  title: string;
  items: T[];
}

interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
}

/** Status-grouped kanban columns (07_STATUS_WORKFLOWS.md "Kanban View Columns"). */
export function KanbanBoard<T extends { id: string }>({ columns, renderCard }: KanbanBoardProps<T>) {
  return (
    <div className="kanban">
      {columns.map((column) => (
        <div className="kanban-column" key={column.key}>
          <h3 className="kanban-title">
            {column.title} <span className="kanban-count">{column.items.length}</span>
          </h3>
          <div className="kanban-cards">
            {column.items.length === 0 ? (
              <p className="muted kanban-empty">No documents</p>
            ) : (
              column.items.map((item) => <Fragment key={item.id}>{renderCard(item)}</Fragment>)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
