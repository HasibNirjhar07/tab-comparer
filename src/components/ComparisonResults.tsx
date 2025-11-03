import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { ColumnFilterInput } from "@/components/ColumnFilterInput";

interface ComparisonResultsProps {
  data1: string[][];
  data2: string[][];
  mismatches: Array<{ row: number; col: number; value1: string; value2: string }>;
  actualTotalRows?: number;
}

export const ComparisonResults = ({ data1, data2, mismatches, actualTotalRows }: ComparisonResultsProps) => {
  const [columnFilter, setColumnFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50; // Rows per page

  const isMismatch = (row: number, col: number) => {
    return mismatches.some(m => m.row === row && m.col === col);
  };

  const getMismatchesByColumn = () => {
    const columns = new Map<number, number>();
    mismatches.forEach(m => {
      columns.set(m.col, (columns.get(m.col) || 0) + 1);
    });
    return columns;
  };

  const columnMismatches = getMismatchesByColumn();
  const maxCols = Math.max(
    Math.max(...(data1.map(row => row.length).concat(0))),
    Math.max(...(data2.map(row => row.length).concat(0)))
  );
  const headers = data1[0] || data2[0] || [];
  const totalRows = actualTotalRows || Math.max(data1.length, data2.length);

  // Total pages (including header row as row 0)
  const totalPages = Math.ceil(totalRows / pageSize);

  // Adjust current page if out of bounds
  if (currentPage < 1) setCurrentPage(1);
  if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);

  // Filter columns based on search
  const visibleColumns = useMemo(() => {
    if (!columnFilter.trim()) {
      return Array.from({ length: maxCols }, (_, i) => i);
    }
    const query = columnFilter.toLowerCase();
    return Array.from({ length: maxCols }, (_, i) => i).filter((idx) => {
      const header = headers[idx] || `Column ${idx + 1}`;
      return header.toLowerCase().includes(query);
    });
  }, [columnFilter, maxCols, headers]);

  if (!data1.length || !data2.length) {
    return null;
  }

  // Calculate row range for current page
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const rowsToDisplay = Array.from({ length: endIndex - startIndex }, (_, i) => startIndex + i);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500">
      {/* Summary Section */}
      <Card className="p-6 border-2">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-primary" />
          Comparison Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">{mismatches.length.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Mismatches</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">{columnMismatches.size}</div>
            <div className="text-sm text-muted-foreground">Columns Affected</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {totalRows.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">Total Rows Compared</div>
            {actualTotalRows && actualTotalRows > Math.max(data1.length, data2.length) && (
              <div className="text-xs text-muted-foreground mt-1">
                (All {actualTotalRows.toLocaleString()} rows analyzed server-side)
              </div>
            )}
          </div>
        </div>

        {columnMismatches.size > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Affected Columns:</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(columnMismatches.entries()).map(([col, count]) => (
                <Badge key={col} variant="destructive" className="bg-mismatch">
                  {headers[col] || `Column ${col + 1}`}: {count.toLocaleString()} mismatch{count > 1 ? 'es' : ''}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Results Table */}
      <Card className="p-6 border-2 overflow-x-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          Detailed Comparison
        </h2>

        <ColumnFilterInput
          value={columnFilter}
          onChange={setColumnFilter}
          availableColumns={headers}
        />

        <div className="my-4 flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing rows {startIndex === 0 ? 'Header' : startIndex} to {endIndex - 1} of {totalRows - 1} data rows
            {actualTotalRows && actualTotalRows !== totalRows && ` (total: ${actualTotalRows})`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-3 text-left font-semibold text-sm">Row</th>
                {visibleColumns.map((idx) => (
                  <th key={idx} className="border border-border p-3 text-left font-semibold text-sm">
                    {headers[idx] || `Column ${idx + 1}`}
                    {columnMismatches.has(idx) && (
                      <Badge variant="destructive" className="ml-2 bg-mismatch text-xs">
                        {columnMismatches.get(idx)}
                      </Badge>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsToDisplay.map((rowIdx) => {
                const row1 = data1[rowIdx] || [];
                const row2 = data2[rowIdx] || [];
                const isHeader = rowIdx === 0;

                return (
                  <tr key={rowIdx} className="hover:bg-accent/50 transition-colors">
                    <td className="border border-border p-3 text-sm font-medium bg-muted">
                      {isHeader ? 'Header' : rowIdx}
                    </td>
                    {visibleColumns.map((colIdx) => {
                      const val1 = row1[colIdx] || '';
                      const val2 = row2[colIdx] || '';
                      const hasMismatch = isMismatch(rowIdx, colIdx);

                      return (
                        <td
                          key={colIdx}
                          className={`border border-border p-3 text-sm transition-all ${
                            hasMismatch
                              ? 'bg-mismatch/20 text-mismatch font-semibold ring-2 ring-mismatch/50'
                              : ''
                          } ${isHeader ? 'font-bold' : ''}`}
                        >
                          <div className="space-y-1">
                            <div className={hasMismatch ? 'line-through opacity-60' : ''}>
                              {val1}
                            </div>
                            {hasMismatch && (
                              <div className="font-bold text-mismatch">→ {val2}</div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};