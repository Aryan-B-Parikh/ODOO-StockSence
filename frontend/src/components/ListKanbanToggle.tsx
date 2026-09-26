export type ListViewMode = 'list' | 'kanban';

interface ListKanbanToggleProps {
  view: ListViewMode;
  onChange: (view: ListViewMode) => void;
}

/** List ⇄ Kanban toggle shared by receipts/deliveries (R5.6, R6.6). */
export function ListKanbanToggle({ view, onChange }: ListKanbanToggleProps) {
  return (
    <div className="view-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        className={view === 'list' ? 'toggle-btn toggle-active' : 'toggle-btn'}
        aria-pressed={view === 'list'}
        onClick={() => onChange('list')}
      >
        List
      </button>
      <button
        type="button"
        className={view === 'kanban' ? 'toggle-btn toggle-active' : 'toggle-btn'}
        aria-pressed={view === 'kanban'}
        onClick={() => onChange('kanban')}
      >
        Kanban
      </button>
    </div>
  );
}
