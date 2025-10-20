import { useState } from "react";
import { FileInput } from "@/components/FileInput";
import { ComparisonResults } from "@/components/ComparisonResults";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileSpreadsheet, GitCompare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const [data1, setData1] = useState<string[][]>([]);
  const [data2, setData2] = useState<string[][]>([]);
  const [mismatches, setMismatches] = useState<Array<{ row: number; col: number; value1: string; value2: string }>>([]);
  const [hasCompared, setHasCompared] = useState(false);

  const compareData = () => {
    if (!data1.length || !data2.length) {
      toast({
        title: "Missing Data",
        description: "Please provide both datasets to compare",
        variant: "destructive"
      });
      return;
    }

    const foundMismatches: Array<{ row: number; col: number; value1: string; value2: string }> = [];
    const maxRows = Math.max(data1.length, data2.length);
    const maxCols = Math.max(
      Math.max(...data1.map(row => row.length)),
      Math.max(...data2.map(row => row.length))
    );

    // Compare all rows including headers (row 0)
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < maxCols; col++) {
        const val1 = data1[row]?.[col]?.toString().trim() || '';
        const val2 = data2[row]?.[col]?.toString().trim() || '';
        
        if (val1 !== val2) {
          foundMismatches.push({
            row,
            col,
            value1: val1,
            value2: val2
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
        <Card className="p-6 mb-8 border-2 shadow-lg">
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <FileInput
              label="Development Dataset"
              value=""
              onChange={setData1}
              placeholder="Paste your development Excel data here (with headers)...&#10;Name&#9;Age&#9;City&#10;John&#9;30&#9;NYC&#10;Jane&#9;25&#9;LA"
              data={data1}
            />
            <FileInput
              label="Production Dataset"
              value=""
              onChange={setData2}
              placeholder="Paste your production Excel data here (with headers)...&#10;Name&#9;Age&#9;City&#10;John&#9;30&#9;NYC&#10;Jane&#9;26&#9;LA"
              data={data2}
            />
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
