import { useState, useCallback, useMemo } from "react";
import { FileInput } from "@/components/FileInput";
import { ComparisonResults } from "@/components/ComparisonResults";
import { SheetSelector } from "@/components/SheetSelector";
import { ColumnSelector } from "@/components/ColumnSelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileSpreadsheet, GitCompare } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import * as XLSX from 'xlsx';

const Index = () => {
  const [data1, setData1] = useState<string[][]>([]);
  const [data2, setData2] = useState<string[][]>([]);
  const [sheets1, setSheets1] = useState<string[]>([]);
  const [sheets2, setSheets2] = useState<string[]>([]);
  const [selectedSheet1, setSelectedSheet1] = useState<string>("");
  const [selectedSheet2, setSelectedSheet2] = useState<string>("");
  const [workbook1, setWorkbook1] = useState<any>(null);
  const [workbook2, setWorkbook2] = useState<any>(null);
  const [comparisonMode, setComparisonMode] = useState<"all" | "specific">("all");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [treatNullAsZero, setTreatNullAsZero] = useState(false);
  const [mismatches, setMismatches] = useState<Array<{ row: number; col: number; value1: string; value2: string }>>([]);
  const [hasCompared, setHasCompared] = useState(false);

  // Extract column headers
  const columns1 = useMemo(() => data1[0] || [], [data1]);
  const columns2 = useMemo(() => data2[0] || [], [data2]);

  // Handle sheet change for dataset 1
  const handleSheet1Change = useCallback((sheetName: string) => {
    setSelectedSheet1(sheetName);
    if (workbook1) {
      const sheet = workbook1.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      setData1(data);
    }
  }, [workbook1]);

  // Handle sheet change for dataset 2
  const handleSheet2Change = useCallback((sheetName: string) => {
    setSelectedSheet2(sheetName);
    if (workbook2) {
      const sheet = workbook2.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      setData2(data);
    }
  }, [workbook2]);

  // Store workbook when file is uploaded
  const handleFile1Upload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const binaryStr = event.target?.result;
      const wb = XLSX.read(binaryStr, { type: 'binary' });
      setWorkbook1(wb);
      setSheets1(wb.SheetNames);
      setSelectedSheet1(wb.SheetNames[0]);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      setData1(data);
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleFile2Upload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const binaryStr = event.target?.result;
      const wb = XLSX.read(binaryStr, { type: 'binary' });
      setWorkbook2(wb);
      setSheets2(wb.SheetNames);
      setSelectedSheet2(wb.SheetNames[0]);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      setData2(data);
    };
    reader.readAsBinaryString(file);
  }, []);

  // Normalize value for NULL/zero comparison
  const normalizeValue = useCallback((val: string): string => {
    if (!treatNullAsZero) return val;
    
    const trimmed = val.trim().toLowerCase();
    // Treat these as equivalent when option is enabled
    if (
      trimmed === 'null' ||
      trimmed === '[null]' ||
      trimmed === '0'
    ) {
      return '__NULL_OR_ZERO__';
    }
    return val;
  }, [treatNullAsZero]);

  const compareData = () => {
    if (!data1.length || !data2.length) {
      toast({
        title: "Missing Data",
        description: "Please provide both datasets to compare",
        variant: "destructive"
      });
      return;
    }

    if (comparisonMode === "specific" && selectedColumns.length === 0) {
      toast({
        title: "No Columns Selected",
        description: "Please select at least one column to compare",
        variant: "destructive"
      });
      return;
    }

    const foundMismatches: Array<{ row: number; col: number; value1: string; value2: string }> = [];
    const maxRows = Math.max(data1.length, data2.length);
    
    // Determine which columns to compare
    let columnsToCompare: number[] = [];
    const headers1 = data1[0] || [];
    const headers2 = data2[0] || [];
    
    if (comparisonMode === "all") {
      const maxCols = Math.max(headers1.length, headers2.length);
      columnsToCompare = Array.from({ length: maxCols }, (_, i) => i);
    } else {
      // Map selected column names to indices
      selectedColumns.forEach(colName => {
        const idx1 = headers1.indexOf(colName);
        const idx2 = headers2.indexOf(colName);
        const idx = idx1 >= 0 ? idx1 : idx2;
        if (idx >= 0 && !columnsToCompare.includes(idx)) {
          columnsToCompare.push(idx);
        }
      });
    }

    // Compare all rows including headers (row 0)
    for (let row = 0; row < maxRows; row++) {
      for (const col of columnsToCompare) {
        const val1Raw = data1[row]?.[col]?.toString().trim() || '';
        const val2Raw = data2[row]?.[col]?.toString().trim() || '';
        
        const val1 = normalizeValue(val1Raw);
        const val2 = normalizeValue(val2Raw);
        
        if (val1 !== val2) {
          foundMismatches.push({
            row,
            col,
            value1: val1Raw,
            value2: val2Raw
          });
        }
      }
    }

    setMismatches(foundMismatches);
    setHasCompared(true);

    toast({
      title: "Comparison Complete",
      description: `Found ${foundMismatches.length} mismatch${foundMismatches.length !== 1 ? 'es' : ''}`,
      variant: foundMismatches.length > 0 ? "default" : "default"
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Excel Compare</h1>
              <p className="text-muted-foreground mt-1">Compare spreadsheets instantly and find differences</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Input Section */}
        <Card className="p-6 mb-8 border-2 shadow-lg space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <FileInput
                label="Development Dataset"
                value=""
                onChange={setData1}
                onSheetsLoaded={(sheets) => {
                  setSheets1(sheets);
                  setSelectedSheet1(sheets[0]);
                }}
                placeholder="Paste your development Excel data here (with headers)...&#10;Name&#9;Age&#9;City&#10;John&#9;30&#9;NYC&#10;Jane&#9;25&#9;LA"
                data={data1}
              />
              {sheets1.length > 0 && (
                <SheetSelector
                  label="Select Sheet (Development)"
                  sheets={sheets1}
                  selectedSheet={selectedSheet1}
                  onSheetChange={handleSheet1Change}
                />
              )}
            </div>
            <div className="space-y-4">
              <FileInput
                label="Production Dataset"
                value=""
                onChange={setData2}
                onSheetsLoaded={(sheets) => {
                  setSheets2(sheets);
                  setSelectedSheet2(sheets[0]);
                }}
                placeholder="Paste your production Excel data here (with headers)...&#10;Name&#9;Age&#9;City&#10;John&#9;30&#9;NYC&#10;Jane&#9;26&#9;LA"
                data={data2}
              />
              {sheets2.length > 0 && (
                <SheetSelector
                  label="Select Sheet (Production)"
                  sheets={sheets2}
                  selectedSheet={selectedSheet2}
                  onSheetChange={handleSheet2Change}
                />
              )}
            </div>
          </div>

          {/* Column Selection */}
          {data1.length > 0 && data2.length > 0 && (
            <ColumnSelector
              columnsA={columns1}
              columnsB={columns2}
              comparisonMode={comparisonMode}
              onModeChange={setComparisonMode}
              selectedColumns={selectedColumns}
              onColumnsChange={setSelectedColumns}
            />
          )}

          {/* NULL/Zero Equivalence Option */}
          <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/30">
            <Checkbox
              id="null-zero"
              checked={treatNullAsZero}
              onCheckedChange={(checked) => setTreatNullAsZero(checked as boolean)}
            />
            <Label htmlFor="null-zero" className="text-sm cursor-pointer">
              Treat NULL-like values and zero as equivalent
              <span className="block text-xs text-muted-foreground mt-1">
                When enabled: NULL, null, [NULL], and 0 are considered equal
              </span>
            </Label>
          </div>
          
          <Button 
            onClick={compareData}
            className="w-full md:w-auto gap-2 bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
            size="lg"
          >
            <GitCompare className="w-5 h-5" />
            Compare Data
          </Button>
        </Card>

        {/* Results Section */}
        {hasCompared && (
          <ComparisonResults 
            data1={data1}
            data2={data2}
            mismatches={mismatches}
          />
        )}

        {!hasCompared && (
          <Card className="p-12 text-center border-2 border-dashed">
            <GitCompare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Ready to Compare</h3>
            <p className="text-muted-foreground">Upload or paste your Excel data above and click "Compare Data" to get started</p>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Index;
