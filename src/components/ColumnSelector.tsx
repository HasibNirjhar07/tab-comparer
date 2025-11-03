import { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface ColumnSelectorProps {
  columnsA: string[];
  columnsB: string[];
  comparisonMode: "all" | "specific";
  onModeChange: (mode: "all" | "specific") => void;
  selectedColumns: string[];
  onColumnsChange: (columns: string[]) => void;
}

export const ColumnSelector = ({
  columnsA,
  columnsB,
  comparisonMode,
  onModeChange,
  selectedColumns,
  onColumnsChange,
}: ColumnSelectorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const commonColumns = useMemo(() => {
    const setA = new Set(columnsA);
    const setB = new Set(columnsB);
    return columnsA.filter((col) => setB.has(col));
  }, [columnsA, columnsB]);

  const onlyInA = useMemo(() => {
    const setB = new Set(columnsB);
    return columnsA.filter((col) => !setB.has(col));
  }, [columnsA, columnsB]);

  const onlyInB = useMemo(() => {
    const setA = new Set(columnsA);
    return columnsB.filter((col) => !setA.has(col));
  }, [columnsA, columnsB]);

  const allColumns = useMemo(() => {
    return [...commonColumns, ...onlyInA, ...onlyInB];
  }, [commonColumns, onlyInA, onlyInB]);

  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return allColumns;
    const query = searchQuery.toLowerCase();
    return allColumns.filter((col) => col.toLowerCase().includes(query));
  }, [allColumns, searchQuery]);

  const toggleColumn = (column: string) => {
    if (selectedColumns.includes(column)) {
      onColumnsChange(selectedColumns.filter((c) => c !== column));
    } else {
      onColumnsChange([...selectedColumns, column]);
    }
  };

  const removeColumn = (column: string) => {
    onColumnsChange(selectedColumns.filter((c) => c !== column));
  };

  if (columnsA.length === 0 && columnsB.length === 0) return null;

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-card">
      <Label className="text-base font-semibold">Column Comparison Scope</Label>
      
      <RadioGroup value={comparisonMode} onValueChange={(v) => onModeChange(v as "all" | "specific")}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="all" id="compare-all" />
          <Label htmlFor="compare-all" className="font-normal cursor-pointer">
            Compare all columns
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="specific" id="compare-specific" />
          <Label htmlFor="compare-specific" className="font-normal cursor-pointer">
            Compare specific columns
          </Label>
        </div>
      </RadioGroup>

      {comparisonMode === "specific" && (
        <div className="space-y-3 mt-4">
          <div>
            <Label className="text-sm mb-2">Search columns</Label>
            <Input
              type="text"
              placeholder="Type to search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>

          {selectedColumns.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Selected columns ({selectedColumns.length}):</Label>
              <div className="flex flex-wrap gap-2">
                {selectedColumns.map((col) => (
                  <Badge key={col} variant="default" className="gap-1">
                    {col}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeColumn(col)}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="border rounded-md p-3 max-h-[200px] overflow-y-auto space-y-2">
            {filteredColumns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No columns found
              </p>
            ) : (
              <>
                {commonColumns.filter((col) => filteredColumns.includes(col)).length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2">
                      In both sheets
                    </Label>
                    {commonColumns
                      .filter((col) => filteredColumns.includes(col))
                      .map((col) => (
                        <div key={col} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`col-${col}`}
                            checked={selectedColumns.includes(col)}
                            onCheckedChange={() => toggleColumn(col)}
                          />
                          <label
                            htmlFor={`col-${col}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {col}
                          </label>
                        </div>
                      ))}
                  </div>
                )}

                {onlyInA.filter((col) => filteredColumns.includes(col)).length > 0 && (
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground mb-2">
                      Only in Development Dataset
                    </Label>
                    {onlyInA
                      .filter((col) => filteredColumns.includes(col))
                      .map((col) => (
                        <div key={col} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`col-${col}`}
                            checked={selectedColumns.includes(col)}
                            onCheckedChange={() => toggleColumn(col)}
                          />
                          <label
                            htmlFor={`col-${col}`}
                            className="text-sm cursor-pointer flex-1 text-muted-foreground"
                          >
                            {col} <span className="text-xs">(A only)</span>
                          </label>
                        </div>
                      ))}
                  </div>
                )}

                {onlyInB.filter((col) => filteredColumns.includes(col)).length > 0 && (
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground mb-2">
                      Only in Production Dataset
                    </Label>
                    {onlyInB
                      .filter((col) => filteredColumns.includes(col))
                      .map((col) => (
                        <div key={col} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`col-${col}`}
                            checked={selectedColumns.includes(col)}
                            onCheckedChange={() => toggleColumn(col)}
                          />
                          <label
                            htmlFor={`col-${col}`}
                            className="text-sm cursor-pointer flex-1 text-muted-foreground"
                          >
                            {col} <span className="text-xs">(B only)</span>
                          </label>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
