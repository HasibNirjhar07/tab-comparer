import { useState, useCallback, useMemo } from "react";
import { ComparisonResults } from "@/components/ComparisonResults";
import { SheetSelector } from "@/components/SheetSelector";
import { ColumnSelector } from "@/components/ColumnSelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileSpreadsheet, GitCompare, Upload, Loader2, FileText, Clipboard, MessageSquare, Sparkles, File, FileJson } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/config/api";

const Index = () => {
  // Existing states
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [data1, setData1] = useState<string[][]>([]);
  const [data2, setData2] = useState<string[][]>([]);
  const [sheets1, setSheets1] = useState<string[]>([]);
  const [sheets2, setSheets2] = useState<string[]>([]);
  const [selectedSheet1, setSelectedSheet1] = useState<string>("");
  const [selectedSheet2, setSelectedSheet2] = useState<string>("");
  const [comparisonMode, setComparisonMode] = useState<"all" | "specific">("all");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [treatNullAsZero, setTreatNullAsZero] = useState(false);
  const [mismatches, setMismatches] = useState<Array<{ row: number; col: number; value1: string; value2: string }>>([]);
  const [hasCompared, setHasCompared] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSheets1, setIsLoadingSheets1] = useState(false);
  const [isLoadingSheets2, setIsLoadingSheets2] = useState(false);
  const [actualRowCount, setActualRowCount] = useState(0);
  const [inputMode1, setInputMode1] = useState<"file" | "paste">("file");
  const [inputMode2, setInputMode2] = useState<"file" | "paste">("file");
  const [pastedData1, setPastedData1] = useState("");
  const [pastedData2, setPastedData2] = useState("");

  // NEW: PDF AI Comparison states
  const [comparisonType, setComparisonType] = useState<"excel-excel" | "pdf-excel" | "jsonl-compare">("excel-excel");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [userInstruction, setUserInstruction] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);
  const [pdfExtractedData, setPdfExtractedData] = useState<any>(null);
  const [selectedExcelSheet, setSelectedExcelSheet] = useState<string>("");
  const [excelSheets, setExcelSheets] = useState<string[]>([]);

  const columns1 = useMemo(() => data1[0] || [], [data1]);
  const columns2 = useMemo(() => data2[0] || [], [data2]);

  // Existing functions (fetchSheets, previewData, handleFile1Upload, etc.) remain the same
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

      if (!response.ok) throw new Error("Failed to fetch sheets");

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

  const previewData = async (
    file: File,
    sheetName: string | null,
    setData: (data: string[][]) => void
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (sheetName) formData.append("sheet_name", sheetName);
    formData.append("max_rows", "100");

    try {
      const response = await fetch(`${API_BASE_URL}/api/preview`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to preview data");

      const result = await response.json();
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

  const handleFile1Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile1(uploadedFile);
    setPastedData1("");
    await fetchSheets(uploadedFile, setSheets1, setSelectedSheet1, setIsLoadingSheets1);
    await previewData(uploadedFile, null, setData1);
  };

  const handleFile2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile2(uploadedFile);
    setPastedData2("");
    await fetchSheets(uploadedFile, setSheets2, setSelectedSheet2, setIsLoadingSheets2);
    await previewData(uploadedFile, null, setData2);
  };

  const handleSheet1Change = useCallback(
    async (sheetName: string) => {
      setSelectedSheet1(sheetName);
      if (file1) await previewData(file1, sheetName, setData1);
    },
    [file1]
  );

  const handleSheet2Change = useCallback(
    async (sheetName: string) => {
      setSelectedSheet2(sheetName);
      if (file2) await previewData(file2, sheetName, setData2);
    },
    [file2]
  );

  const parsePastedData = (text: string): string[][] => {
    if (!text.trim()) return [];
    
    const lines = text.trim().split('\n');
    const data: string[][] = [];
    
    for (const line of lines) {
      let row: string[];
      if (line.includes('\t')) {
        row = line.split('\t');
      } else {
        row = line.split(',').map(cell => cell.trim());
      }
      data.push(row);
    }
    
    return data;
  };

  const handlePaste1 = () => {
    if (!pastedData1.trim()) {
      toast({
        title: "No Data",
        description: "Please paste some data first",
        variant: "destructive",
      });
      return;
    }

    const parsed = parsePastedData(pastedData1);
    if (parsed.length === 0) {
      toast({
        title: "Invalid Data",
        description: "Could not parse the pasted data",
        variant: "destructive",
      });
      return;
    }

    setData1(parsed);
    setFile1(null);
    setSheets1([]);
    setSelectedSheet1("");
    
    toast({
      title: "Data Loaded",
      description: `Loaded ${parsed.length} rows from pasted data`,
    });
  };

  const handlePaste2 = () => {
    if (!pastedData2.trim()) {
      toast({
        title: "No Data",
        description: "Please paste some data first",
        variant: "destructive",
      });
      return;
    }

    const parsed = parsePastedData(pastedData2);
    if (parsed.length === 0) {
      toast({
        title: "Invalid Data",
        description: "Could not parse the pasted data",
        variant: "destructive",
      });
      return;
    }

    setData2(parsed);
    setFile2(null);
    setSheets2([]);
    setSelectedSheet2("");
    
    toast({
      title: "Data Loaded",
      description: `Loaded ${parsed.length} rows from pasted data`,
    });
  };

  const compareData = async () => {
    if ((!file1 && data1.length === 0) || (!file2 && data2.length === 0)) {
      toast({
        title: "Missing Data",
        description: "Please provide data for both datasets",
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
    
    if (!file1 || !file2) {
      // Client-side comparison for pasted data
      try {
        const mismatches: Array<{ row: number; col: number; value1: string; value2: string }> = [];
        const maxRows = Math.max(data1.length, data2.length);
        const maxCols = Math.max(data1[0]?.length || 0, data2[0]?.length || 0);

        let colsToCompare: number[] = [];
        if (comparisonMode === "all") {
          colsToCompare = Array.from({ length: maxCols }, (_, i) => i);
        } else {
          colsToCompare = selectedColumns
            .map(colName => columns1.indexOf(colName))
            .filter(idx => idx !== -1);
        }

        for (let row = 1; row < maxRows; row++) {
          for (const col of colsToCompare) {
            const val1 = data1[row]?.[col] || "";
            const val2 = data2[row]?.[col] || "";

            const normalizeValue = (val: string) => {
              if (!treatNullAsZero) return val;
              const trimmed = val.trim().toLowerCase();
              if (trimmed === "" || trimmed === "null" || trimmed === "[null]" || trimmed === "0") {
                return "0";
              }
              return val;
            };

            if (normalizeValue(val1) !== normalizeValue(val2)) {
              mismatches.push({ row, col, value1: val1, value2: val2 });
            }
          }
        }

        setMismatches(mismatches);
        setHasCompared(true);
        setActualRowCount(maxRows - 1);

        toast({
          title: "Comparison Complete",
          description: `Found ${mismatches.length.toLocaleString()} mismatch${mismatches.length !== 1 ? "es" : ""}`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to compare data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Server-side comparison
    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("comparison_mode", comparisonMode);
    formData.append("selected_columns", JSON.stringify(selectedColumns));
    formData.append("treat_null_as_zero", treatNullAsZero.toString());

    if (selectedSheet1) formData.append("sheet_name1", selectedSheet1);
    if (selectedSheet2) formData.append("sheet_name2", selectedSheet2);

    try {
      const response = await fetch(`${API_BASE_URL}/api/compare/large`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Comparison failed");

      const result = await response.json();

      setData1([result.headers1, ...result.data1_sample]);
      setData2([result.headers2, ...result.data2_sample]);

      setMismatches(result.mismatches);
      setHasCompared(true);

      const maxRows = Math.max(result.file1_rows || 0, result.file2_rows || 0);
      setActualRowCount(maxRows);

      toast({
        title: "Comparison Complete",
        description: `Found ${result.total_mismatches.toLocaleString()} mismatch${result.total_mismatches !== 1 ? "es" : ""}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to compare files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: PDF Upload Handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setPdfFile(uploadedFile);
    
    // Extract PDF content
    const formData = new FormData();
    formData.append("file", uploadedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/pdf/extract`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to extract PDF");

      const result = await response.json();
      setPdfExtractedData(result);

      toast({
        title: "PDF Loaded",
        description: `Found ${result.page_count} pages and ${result.tables_found} tables`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to extract PDF content",
        variant: "destructive",
      });
    }
  };

  // NEW: Excel Upload for PDF comparison
  const handleExcelUploadForPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setExcelFile(uploadedFile);
    
    // Get sheets if Excel
    const formData = new FormData();
    formData.append("file", uploadedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload/sheets`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to fetch sheets");

      const data = await response.json();
      setExcelSheets(data.sheets);
      setSelectedExcelSheet(data.sheets[0]);

      toast({
        title: "Excel Loaded",
        description: `File uploaded successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load Excel file",
        variant: "destructive",
      });
    }
  };

  // NEW: AI Comparison Handler
  const handleAiComparison = async () => {
    if (!pdfFile || !excelFile) {
      toast({
        title: "Missing Files",
        description: "Please upload both PDF and Excel files",
        variant: "destructive",
      });
      return;
    }

    if (!userInstruction.trim()) {
      toast({
        title: "Missing Instruction",
        description: "Please describe what you want to compare",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const formData = new FormData();
    formData.append("pdf_file", pdfFile);
    formData.append("excel_file", excelFile);
    formData.append("user_instruction", userInstruction);
    if (selectedExcelSheet) formData.append("sheet_name", selectedExcelSheet);

    try {
      const response = await fetch(`${API_BASE_URL}/api/pdf/compare`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("AI comparison failed");

      const result = await response.json();
      setAiResult(result);

      toast({
        title: "AI Comparison Complete",
        description: result.summary || "Comparison completed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to perform AI comparison. Make sure GEMINI_API_KEY is configured.",
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
                Excel & PDF Compare Pro AI
              </h1>
              <p className="text-muted-foreground mt-1">
                AI-powered comparison for Excel, CSV, and PDF documents
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Comparison Type Selector */}
        <Card className="p-6 mb-8 border-2 shadow-lg">
          <Label className="text-lg font-semibold mb-4 block">Select Comparison Type</Label>
          <Tabs value={comparisonType} onValueChange={(v) => setComparisonType(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="excel-excel" className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Excel vs Excel
              </TabsTrigger>
              <TabsTrigger value="jsonl-compare" className="gap-2">
                <FileJson className="w-4 h-4" />
                JSONL vs JSONL
              </TabsTrigger>
              <TabsTrigger value="pdf-excel" className="gap-2">
                <Sparkles className="w-4 h-4" />
                PDF vs Excel (AI)
              </TabsTrigger>
            </TabsList>

            {/* Excel vs Excel Mode */}
            <TabsContent value="excel-excel" className="space-y-6 mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Dataset 1 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Development Dataset</Label>
                    {data1.length > 0 && (
                      <Badge variant="default">{data1.length} rows loaded</Badge>
                    )}
                  </div>

                  <Tabs value={inputMode1} onValueChange={(v) => setInputMode1(v as any)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="file" className="gap-2">
                        <Upload className="w-4 h-4" />
                        Upload File
                      </TabsTrigger>
                      <TabsTrigger value="paste" className="gap-2">
                        <Clipboard className="w-4 h-4" />
                        Paste Data
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="file" className="space-y-4 mt-4">
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
                        className="w-full"
                        disabled={isLoading}
                      >
                        <label htmlFor="file1" className="cursor-pointer flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          {file1 ? file1.name : "Upload Excel or CSV"}
                        </label>
                      </Button>

                      {isLoadingSheets1 && (
                        <div className="flex items-center gap-2 text-sm">
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
                    </TabsContent>

                    <TabsContent value="paste" className="space-y-4 mt-4">
                      <Textarea
                        placeholder="Paste CSV or TSV data here..."
                        value={pastedData1}
                        onChange={(e) => setPastedData1(e.target.value)}
                        className="font-mono text-sm min-h-[150px]"
                        disabled={isLoading}
                      />
                      <Button
                        onClick={handlePaste1}
                        className="w-full"
                        variant="outline"
                        disabled={isLoading || !pastedData1.trim()}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Load Pasted Data
                      </Button>
                    </TabsContent>
                  </Tabs>

                  {data1.length > 0 && (
                    <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
                      <p className="text-xs text-muted-foreground mb-2">Preview</p>
                      <div className="text-xs">
                        <strong>Columns:</strong> {columns1.join(", ")}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dataset 2 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Production Dataset</Label>
                    {data2.length > 0 && (
                      <Badge variant="default">{data2.length} rows loaded</Badge>
                    )}
                  </div>

                  <Tabs value={inputMode2} onValueChange={(v) => setInputMode2(v as any)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="file" className="gap-2">
                        <Upload className="w-4 h-4" />
                        Upload File
                      </TabsTrigger>
                      <TabsTrigger value="paste" className="gap-2">
                        <Clipboard className="w-4 h-4" />
                        Paste Data
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="file" className="space-y-4 mt-4">
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
                        className="w-full"
                        disabled={isLoading}
                      >
                        <label htmlFor="file2" className="cursor-pointer flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          {file2 ? file2.name : "Upload Excel or CSV"}
                        </label>
                      </Button>

                      {isLoadingSheets2 && (
                        <div className="flex items-center gap-2 text-sm">
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
                    </TabsContent>

                    <TabsContent value="paste" className="space-y-4 mt-4">
                      <Textarea
                        placeholder="Paste CSV or TSV data here..."
                        value={pastedData2}
                        onChange={(e) => setPastedData2(e.target.value)}
                        className="font-mono text-sm min-h-[150px]"
                        disabled={isLoading}
                      />
                      <Button
                        onClick={handlePaste2}
                        className="w-full"
                        variant="outline"
                        disabled={isLoading || !pastedData2.trim()}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Load Pasted Data
                      </Button>
                    </TabsContent>
                  </Tabs>

                  {data2.length > 0 && (
                    <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
                      <p className="text-xs text-muted-foreground mb-2">Preview</p>
                      <div className="text-xs">
                        <strong>Columns:</strong> {columns2.join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

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

              <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/30">
                <Checkbox
                  id="null-zero"
                  checked={treatNullAsZero}
                  onCheckedChange={(checked) => setTreatNullAsZero(checked as boolean)}
                  disabled={isLoading}
                />
                <Label htmlFor="null-zero" className="text-sm cursor-pointer">
                  Treat NULL-like values and zero as equivalent
                </Label>
              </div>

              <Button
                onClick={compareData}
                className="w-full gap-2"
                size="lg"
                disabled={isLoading || (data1.length === 0 || data2.length === 0)}
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
            </TabsContent>

            {/* JSONL vs JSONL Mode */}
            <TabsContent value="jsonl-compare" className="space-y-6 mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Dataset 1 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">First JSONL/JSON File</Label>
                    {data1.length > 0 && (
                      <Badge variant="default">{data1.length} rows loaded</Badge>
                    )}
                  </div>

                  <input
                    type="file"
                    accept=".json,.jsonl"
                    onChange={handleFile1Upload}
                    className="hidden"
                    id="json-file1"
                    disabled={isLoading}
                  />
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                    disabled={isLoading}
                  >
                    <label htmlFor="json-file1" className="cursor-pointer flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      {file1 ? file1.name : "Upload JSONL or JSON"}
                    </label>
                  </Button>

                  {data1.length > 0 && (
                    <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
                      <p className="text-xs text-muted-foreground mb-2">Preview</p>
                      <div className="text-xs">
                        <strong>Columns:</strong> {columns1.join(", ")}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dataset 2 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Second JSONL/JSON File</Label>
                    {data2.length > 0 && (
                      <Badge variant="default">{data2.length} rows loaded</Badge>
                    )}
                  </div>

                  <input
                    type="file"
                    accept=".json,.jsonl"
                    onChange={handleFile2Upload}
                    className="hidden"
                    id="json-file2"
                    disabled={isLoading}
                  />
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                    disabled={isLoading}
                  >
                    <label htmlFor="json-file2" className="cursor-pointer flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      {file2 ? file2.name : "Upload JSONL or JSON"}
                    </label>
                  </Button>

                  {data2.length > 0 && (
                    <div className="border rounded-md p-3 bg-muted/30 max-h-[200px] overflow-auto">
                      <p className="text-xs text-muted-foreground mb-2">Preview</p>
                      <div className="text-xs">
                        <strong>Columns:</strong> {columns2.join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

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

              <Button
                onClick={compareData}
                className="w-full gap-2"
                size="lg"
                disabled={isLoading || (data1.length === 0 || data2.length === 0)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Comparing...
                  </>
                ) : (
                  <>
                    <GitCompare className="w-5 h-5" />
                    Compare JSONL Data
                  </>
                )}
              </Button>
            </TabsContent>

            {/* PDF vs Excel Mode (AI) */}
            <TabsContent value="pdf-excel" className="space-y-6 mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* PDF Upload */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Upload PDF Document</Label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                    id="pdf-file"
                    disabled={isLoading}
                  />
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                    disabled={isLoading}
                  >
                    <label htmlFor="pdf-file" className="cursor-pointer flex items-center gap-2">
                      <File className="w-4 h-4" />
                      {pdfFile ? pdfFile.name : "Upload PDF"}
                    </label>
                  </Button>

                  {pdfExtractedData && (
                    <div className="border rounded-md p-3 bg-muted/30">
                      <p className="text-xs font-semibold mb-2">PDF Info:</p>
                      <div className="text-xs space-y-1">
                        <div>Pages: {pdfExtractedData.page_count}</div>
                        <div>Tables Found: {pdfExtractedData.tables_found}</div>
                        {pdfExtractedData.text_preview && (
                          <div className="mt-2 max-h-24 overflow-y-auto">
                            <strong>Text Preview:</strong>
                            <p className="text-muted-foreground mt-1">
                              {pdfExtractedData.text_preview}...
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Excel Upload */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Upload Excel/CSV</Label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelUploadForPdf}
                    className="hidden"
                    id="excel-file-pdf"
                    disabled={isLoading}
                  />
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                    disabled={isLoading}
                  >
                    <label htmlFor="excel-file-pdf" className="cursor-pointer flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      {excelFile ? excelFile.name : "Upload Excel/CSV"}
                    </label>
                  </Button>

                  {excelSheets.length > 0 && (
                    <SheetSelector
                      label="Select Sheet"
                      sheets={excelSheets}
                      selectedSheet={selectedExcelSheet}
                      onSheetChange={setSelectedExcelSheet}
                    />
                  )}
                </div>
              </div>

              {/* AI Instruction Input */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Tell AI what to compare
                </Label>
                <Textarea
                  placeholder="Example: Compare the invoice amounts in the PDF with the revenue column in Excel and check if they match..."
                  value={userInstruction}
                  onChange={(e) => setUserInstruction(e.target.value)}
                  className="min-h-[120px]"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  💡 Tip: Be specific about what you want to compare. The AI will understand your intent and find matches/mismatches.
                </p>
              </div>

              <Button
                onClick={handleAiComparison}
                className="w-full gap-2"
                size="lg"
                disabled={isLoading || !pdfFile || !excelFile || !userInstruction.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AI is analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Compare with AI
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Results Section */}
        {comparisonType === "excel-excel" && hasCompared && (
          <ComparisonResults
            data1={data1}
            data2={data2}
            mismatches={mismatches}
            actualTotalRows={actualRowCount}
          />
        )}

        {comparisonType === "pdf-excel" && aiResult && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold">AI Comparison Results</h2>
            </div>

            {/* AI Understanding */}
            {aiResult.understanding && (
              <div className="border-l-4 border-primary pl-4 py-2 bg-primary/5 rounded-r">
                <h3 className="font-semibold text-sm mb-1">AI Understanding:</h3>
                <p className="text-sm text-muted-foreground">{aiResult.understanding}</p>
              </div>
            )}

            {/* Comparison Strategy */}
            {aiResult.comparison_strategy && (
              <div className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-r">
                <h3 className="font-semibold text-sm mb-1">Approach:</h3>
                <p className="text-sm text-muted-foreground">{aiResult.comparison_strategy}</p>
              </div>
            )}

            {/* Summary */}
            {aiResult.summary && (
              <div className="border-l-4 border-green-500 pl-4 py-2 bg-green-50 dark:bg-green-950/20 rounded-r">
                <h3 className="font-semibold text-sm mb-1">Summary:</h3>
                <p className="text-sm">{aiResult.summary}</p>
              </div>
            )}

            {/* Confidence */}
            {aiResult.confidence && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Confidence:</span>
                <Badge 
                  variant={
                    aiResult.confidence === "high" ? "default" : 
                    aiResult.confidence === "medium" ? "secondary" : 
                    "outline"
                  }
                >
                  {aiResult.confidence.toUpperCase()}
                </Badge>
              </div>
            )}

            {/* Matches */}
            {aiResult.matches && aiResult.matches.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-green-600">✓</span> Matches ({aiResult.matches.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {aiResult.matches.slice(0, 10).map((match: any, idx: number) => (
                    <div key={idx} className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/10">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-semibold">PDF:</span> {match.pdf_value}
                        </div>
                        <div>
                          <span className="font-semibold">Excel:</span> {match.excel_value}
                        </div>
                      </div>
                      {match.location && (
                        <p className="text-xs text-muted-foreground mt-1">Location: {match.location}</p>
                      )}
                    </div>
                  ))}
                  {aiResult.matches.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {aiResult.matches.length - 10} more matches
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Mismatches */}
            {aiResult.mismatches && aiResult.mismatches.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-red-600">✗</span> Mismatches ({aiResult.mismatches.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {aiResult.mismatches.map((mismatch: any, idx: number) => (
                    <div key={idx} className="border rounded-lg p-3 bg-red-50 dark:bg-red-950/10">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-semibold">PDF:</span> {mismatch.pdf_value}
                        </div>
                        <div>
                          <span className="font-semibold">Excel:</span> {mismatch.excel_value}
                        </div>
                      </div>
                      {mismatch.difference && (
                        <p className="text-xs text-red-600 mt-1">Difference: {mismatch.difference}</p>
                      )}
                      {mismatch.location && (
                        <p className="text-xs text-muted-foreground mt-1">Location: {mismatch.location}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing in Excel */}
            {aiResult.missing_in_excel && aiResult.missing_in_excel.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-orange-600">⚠</span> Missing in Excel ({aiResult.missing_in_excel.length})
                </h3>
                <div className="border rounded-lg p-3 bg-orange-50 dark:bg-orange-950/10">
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    {aiResult.missing_in_excel.slice(0, 10).map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  {aiResult.missing_in_excel.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ...and {aiResult.missing_in_excel.length - 10} more items
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Missing in PDF */}
            {aiResult.missing_in_pdf && aiResult.missing_in_pdf.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-orange-600">⚠</span> Missing in PDF ({aiResult.missing_in_pdf.length})
                </h3>
                <div className="border rounded-lg p-3 bg-orange-50 dark:bg-orange-950/10">
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    {aiResult.missing_in_pdf.slice(0, 10).map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  {aiResult.missing_in_pdf.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ...and {aiResult.missing_in_pdf.length - 10} more items
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            {aiResult.metadata && (
              <div className="border-t pt-4 mt-4">
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold mb-2">View Metadata</summary>
                  <div className="bg-muted/30 rounded p-3 space-y-1">
                    <div>PDF: {aiResult.metadata.pdf_filename} ({aiResult.metadata.pdf_pages} pages)</div>
                    <div>Excel: {aiResult.metadata.excel_filename} ({aiResult.metadata.excel_rows} rows)</div>
                    <div>Tables in PDF: {aiResult.metadata.pdf_tables}</div>
                  </div>
                </details>
              </div>
            )}

            {/* Error Display */}
            {aiResult.error && (
              <div className="border-l-4 border-red-500 pl-4 py-2 bg-red-50 dark:bg-red-950/20 rounded-r">
                <h3 className="font-semibold text-sm mb-1 text-red-600">Error:</h3>
                <p className="text-sm">{aiResult.error}</p>
                {aiResult.raw_response && (
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer">View Raw Response</summary>
                    <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-x-auto">
                      {aiResult.raw_response}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </Card>
        )}

        {!hasCompared && !aiResult && (
          <Card className="p-12 text-center border-2 border-dashed">
            <GitCompare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Ready to Compare
            </h3>
            <p className="text-muted-foreground">
              Choose your comparison mode above to get started
            </p>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>📊 Excel vs Excel: Traditional row-by-row comparison</p>
              <p>🤖 PDF vs Excel: AI-powered intelligent matching</p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Index;