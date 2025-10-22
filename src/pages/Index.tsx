import { useState, useCallback, useMemo } from "react";
import { ComparisonResults } from "@/components/ComparisonResults";
import { SheetSelector } from "@/components/SheetSelector";
import { ColumnSelector } from "@/components/ColumnSelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileSpreadsheet, GitCompare, Upload, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/config/api";

const Index = () => {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [data1, setData1] = useState<string[][]>([]);
  const [data2, setData2] = useState<string[][]>([]);
  const [sheets1, setSheets1] = useState<string[]>([]);
  const [sheets2, setSheets2] = useState<string[]>([]);
  const [selectedSheet1, setSelectedSheet1] = useState<string>("");
  const [selectedSheet2, setSelectedSheet2] = useState<string>("");
  const [comparisonMode, setComparisonMode] = useState<"all" | "specific">(
    "all"
  );
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [treatNullAsZero, setTreatNullAsZero] = useState(false);
  const [mismatches, setMismatches] = useState<
    Array<{ row: number; col: number; value1: string; value2: string }>
  >([]);
  const [hasCompared, setHasCompared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSheets1, setIsLoadingSheets1] = useState(false);
  const [isLoadingSheets2, setIsLoadingSheets2] = useState(false);
  const [actualRowCount, setActualRowCount] = useState(0);

  // Extract column headers
  const columns1 = useMemo(() => data1[0] || [], [data1]);
  const columns2 = useMemo(() => data2[0] || [], [data2]);

  // Fetch sheets from API
  const fetchSheets = async (
    file: File,
    setSheets: (sheets: string[]) => void,
    setSelectedSheet: (sheet: string) => void,
    setIsLoadingSheets: (loading: boolean) => void
  ) => {
    setIsLoadingSheets(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload/sheets`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch sheets");
      }

      const data = await response.json();
      setSheets(data.sheets);
      setSelectedSheet(data.sheets[0]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load sheet names",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // Preview data from API
  const previewData = async (
    file: File,
    sheetName: string | null,
    setData: (data: string[][]) => void
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (sheetName) {
      formData.append("sheet_name", sheetName);
    }
    formData.append("max_rows", "100");

    try {
      const response = await fetch(`${API_BASE_URL}/api/preview`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to preview data");
      }

      const result = await response.json();
      // Combine headers and data
      const fullData = [result.headers, ...result.data];
      setData(fullData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to preview data",
        variant: "destructive",
      });
    }
  };

  // Handle file upload for dataset 1
  const handleFile1Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile1(uploadedFile);
    await fetchSheets(
      uploadedFile,
      setSheets1,
      setSelectedSheet1,
      setIsLoadingSheets1
    );
    await previewData(uploadedFile, null, setData1);
  };

  // Handle file upload for dataset 2
  const handleFile2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile2(uploadedFile);
    await fetchSheets(
      uploadedFile,
      setSheets2,
      setSelectedSheet2,
      setIsLoadingSheets2
    );
    await previewData(uploadedFile, null, setData2);
  };

  // Handle sheet change
  const handleSheet1Change = useCallback(
    async (sheetName: string) => {
      setSelectedSheet1(sheetName);
      if (file1) {
        await previewData(file1, sheetName, setData1);
      }
    },
    [file1]
  );

  const handleSheet2Change = useCallback(
    async (sheetName: string) => {
      setSelectedSheet2(sheetName);
      if (file2) {
        await previewData(file2, sheetName, setData2);
      }
    },
    [file2]
  );

  const compareData = async () => {
    if (!file1 || !file2) {
      toast({
        title: "Missing Files",
        description: "Please upload both Excel files to compare",
        variant: "destructive",
      });
      return;
    }

    if (comparisonMode === "specific" && selectedColumns.length === 0) {
      toast({
        title: "No Columns Selected",
        description: "Please select at least one column to compare",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("comparison_mode", comparisonMode);
    formData.append("selected_columns", JSON.stringify(selectedColumns));
    formData.append("treat_null_as_zero", treatNullAsZero.toString());

    if (selectedSheet1) {
      formData.append("sheet_name1", selectedSheet1);
    }
    if (selectedSheet2) {
      formData.append("sheet_name2", selectedSheet2);
    }

    try {
      // Use /api/compare/large for better performance with large files
      const response = await fetch(`${API_BASE_URL}/api/compare/large`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Comparison failed");
      }

      const result = await response.json();

      // Update data with samples from backend
      setData1([result.headers1, ...result.data1_sample]);
      setData2([result.headers2, ...result.data2_sample]);

      setMismatches(result.mismatches);
      setHasCompared(true);

      const file1Rows = result.file1_rows || result.total_rows;
      const file2Rows = result.file2_rows || result.total_rows;
      const maxRows = Math.max(file1Rows, file2Rows);

      setActualRowCount(maxRows);

      toast({
        title: "Comparison Complete",
        description: `Compared ${maxRows.toLocaleString()} rows. Found ${result.total_mismatches.toLocaleString()} mismatch${
          result.total_mismatches !== 1 ? "es" : ""
        }`,
        variant: result.total_mismatches > 0 ? "default" : "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to compare files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Excel & CSV Compare Pro
              </h1>
              <p className="text-muted-foreground mt-1">
                Server-powered comparison for millions of rows
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Input Section */}
        <Card className="p-6 mb-8 border-2 shadow-lg space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Dataset 1 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Development Dataset
                </Label>
                {data1.length > 0 && (
                  <Badge variant="default" className="gap-1">
                    {data1.length} rows loaded
                  </Badge>
                )}
              </div>

              <input
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
                onChange={handleFile1Upload}
                className="hidden"
                id="file1"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                asChild
                className="flex items-center gap-2 hover:border-primary hover:text-primary transition-colors w-full"
                disabled={isLoading}
              >
                <label htmlFor="file1" className="cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {file1 ? file1.name : "Upload Excel or CSV"}
                </label>
              </Button>

              {isLoadingSheets1 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading sheets...
                </div>
              )}

              {sheets1.length > 0 && (
                <SheetSelector
                  label="Select Sheet"
                  sheets={sheets1}
                  selectedSheet={selectedSheet1}
                  onSheetChange={handleSheet1Change}
                />
              )}

              {data1.length > 0 && (
                <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
                  <p className="text-xs text-muted-foreground mb-2">
                    Preview (first 100 rows)
                  </p>
                  <div className="text-xs">
                    <strong>Columns:</strong> {columns1.join(", ")}
                  </div>
                </div>
              )}
            </div>

            {/* Dataset 2 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Production Dataset
                </Label>
                {data2.length > 0 && (
                  <Badge variant="default" className="gap-1">
                    {data2.length} rows loaded
                  </Badge>
                )}
              </div>

              <input
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
                onChange={handleFile2Upload}
                className="hidden"
                id="file2"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                asChild
                className="flex items-center gap-2 hover:border-primary hover:text-primary transition-colors w-full"
                disabled={isLoading}
              >
                <label htmlFor="file2" className="cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {file2 ? file2.name : "Upload Excel or CSV"}
                </label>
              </Button>

              {isLoadingSheets2 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading sheets...
                </div>
              )}

              {sheets2.length > 0 && (
                <SheetSelector
                  label="Select Sheet"
                  sheets={sheets2}
                  selectedSheet={selectedSheet2}
                  onSheetChange={handleSheet2Change}
                />
              )}

              {data2.length > 0 && (
                <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
                  <p className="text-xs text-muted-foreground mb-2">
                    Preview (first 100 rows)
                  </p>
                  <div className="text-xs">
                    <strong>Columns:</strong> {columns2.join(", ")}
                  </div>
                </div>
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
              onCheckedChange={(checked) =>
                setTreatNullAsZero(checked as boolean)
              }
              disabled={isLoading}
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
            disabled={isLoading || !file1 || !file2}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <GitCompare className="w-5 h-5" />
                Compare Data
              </>
            )}
          </Button>
        </Card>

        {/* Results Section */}
        {hasCompared && (
          <ComparisonResults
            data1={data1}
            data2={data2}
            mismatches={mismatches}
            actualTotalRows={actualRowCount}
          />
        )}

        {!hasCompared && (
          <Card className="p-12 text-center border-2 border-dashed">
            <GitCompare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Ready to Compare
            </h3>
            <p className="text-muted-foreground">
              Upload your Excel or CSV files above and click "Compare Data" to
              get started
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              ✨ Now supports millions of rows with server-side processing
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              📊 Supported formats: .xlsx, .xls, .xlsm, .xlsb, .csv
            </p>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Index;
