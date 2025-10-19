import { Upload, CheckCircle2, Table } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from 'xlsx';

interface FileInputProps {
  label: string;
  value: string;
  onChange: (data: string[][]) => void;
  placeholder: string;
  data: string[][];
}

export const FileInput = ({ label, value, onChange, placeholder, data }: FileInputProps) => {
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const binaryStr = event.target?.result;
      const workbook = XLSX.read(binaryStr, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      onChange(data);
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (!text.trim()) {
      onChange([]);
      return;
    }

    const rows = text.split('\n').filter(row => row.trim());
    const data = rows.map(row => row.split('\t'));
    onChange(data);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">{label}</Label>
        {data.length > 0 && (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {data.length} rows loaded
          </Badge>
        )}
      </div>
      <div className="flex gap-3">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          className="hidden"
          id={`file-${label}`}
        />
        <Button
          variant="outline"
          asChild
          className="flex items-center gap-2 hover:border-primary hover:text-primary transition-colors"
        >
          <label htmlFor={`file-${label}`} className="cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Excel
          </label>
        </Button>
      </div>
      <div 
        contentEditable
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text');
          if (!text.trim()) {
            onChange([]);
            return;
          }
          const rows = text.split('\n').filter(row => row.trim());
          const data = rows.map(row => row.split('\t'));
          onChange(data);
        }}
        className="min-h-[120px] border rounded-md bg-background p-3 focus:outline-none focus:ring-2 focus:ring-primary overflow-auto"
      >
        {data.length === 0 ? (
          <div className="grid grid-cols-[repeat(5,minmax(100px,1fr))] gap-px bg-border">
            {Array.from({ length: 20 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-card border border-border p-2 min-h-[32px] text-xs text-muted-foreground/50"
              >
                {idx === 0 && placeholder}
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, colIndex) => (
                    <td 
                      key={colIndex} 
                      className="border border-border px-2 py-1 text-xs min-w-[100px]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {data.length > 0 && (
        <div className="border rounded-md bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
            <Table className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Preview</span>
          </div>
          <ScrollArea className="h-[200px]">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="border border-border bg-muted px-2 py-1 text-xs font-semibold text-left w-12">#</th>
                  {data[0]?.map((_, colIndex) => (
                    <th key={colIndex} className="border border-border bg-muted px-2 py-1 text-xs font-semibold text-left min-w-[100px]">
                      {String.fromCharCode(65 + colIndex)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex === 0 ? "bg-primary/5" : ""}>
                    <td className="border border-border bg-muted/30 px-2 py-1 text-xs font-medium text-center">
                      {rowIndex + 1}
                    </td>
                    {row.map((cell, colIndex) => (
                      <td 
                        key={colIndex} 
                        className={`border border-border px-2 py-1 text-xs ${rowIndex === 0 ? 'font-semibold' : ''}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
