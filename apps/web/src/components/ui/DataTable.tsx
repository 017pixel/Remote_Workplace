import type { ReactNode } from "react";

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  priority?: "primary" | "secondary" | "detail";
  mono?: boolean;
}

export function DataTable<Row>({ rows, columns, getRowKey, empty, caption, rowActions }: {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  getRowKey: (row: Row) => string;
  empty?: ReactNode;
  caption?: string;
  rowActions?: (row: Row) => ReactNode;
}) {
  if (rows.length === 0) return <div className="ui-data-table-empty">{empty ?? "Keine Einträge"}</div>;
  return (
    <div className="ui-data-table-wrap">
      <table className="ui-data-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead><tr>{columns.map((column) => <th key={column.id} scope="col">{column.header}</th>)}{rowActions ? <th scope="col"><span className="sr-only">Aktionen</span></th> : null}</tr></thead>
        <tbody>{rows.map((row) => <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.id} data-label={column.header} data-priority={column.priority ?? "detail"} className={column.mono ? "is-mono" : undefined}>{column.cell(row)}</td>)}{rowActions ? <td className="ui-data-table-actions">{rowActions(row)}</td> : null}</tr>)}</tbody>
      </table>
      <div className="ui-data-cards">{rows.map((row) => <article key={getRowKey(row)}>{columns.map((column) => <div key={column.id} data-priority={column.priority ?? "detail"}><span>{column.header}</span><strong className={column.mono ? "is-mono" : undefined}>{column.cell(row)}</strong></div>)}{rowActions ? <div className="ui-data-card-actions">{rowActions(row)}</div> : null}</article>)}</div>
    </div>
  );
}
