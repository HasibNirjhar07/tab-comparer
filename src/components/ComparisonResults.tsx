import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ComparisonResultsProps {
  data1: string[][];
  data2: string[][];
  mismatches: Array<{ row: number; col: number; value1: string; value2: string }>;
}

export const ComparisonResults = ({ data1, data2, mismatches }: ComparisonResultsProps) => {
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

  if (!data1.length || !data2.length) {
    return null;
  }

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
            <div className="text-2xl font-bold text-primary">{mismatches.length}</div>
            <div className="text-sm text-muted-foreground">Total Mismatches</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">{columnMismatches.size}</div>
            <div className="text-sm text-muted-foreground">Columns Affected</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {Math.max(data1.length, data2.length)}
            </div>
            <div className="text-sm text-muted-foreground">Total Rows (incl. header)</div>
          </div>
        </div>
        
        {columnMismatches.size > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Affected Columns:</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(columnMismatches.entries()).map(([col, count]) => (
                <Badge key={col} variant="destructive" className="bg-mismatch">
                  Column {String.fromCharCode(65 + col)}: {count} mismatch{count > 1 ? 'es' : ''}
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-3 text-left font-semibold text-sm">Row</th>
                {Array.from({ length: maxCols }, (_, idx) => (
                  <th key={idx} className="border border-border p-3 text-left font-semibold text-sm">
                    Column {String.fromCharCode(65 + idx)}
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
              {Array.from({ length: Math.max(data1.length, data2.length) }, (_, rowIdx) => {
                const row1 = data1[rowIdx] || [];
                const row2 = data2[rowIdx] || [];
                
                return (
                  <tr key={rowIdx} className="hover:bg-accent/50 transition-colors">
                    <td className="border border-border p-3 text-sm font-medium bg-muted">
                      {rowIdx === 0 ? 'Header' : rowIdx}
                    </td>
                    {Array.from({ length: maxCols }, (_, colIdx) => {
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
                          }`}
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
