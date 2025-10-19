import { Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import * as XLSX from 'xlsx';

interface FileInputProps {
  label: string;
  value: string;
  onChange: (data: string[][]) => void;
  placeholder: string;
}

export const FileInput = ({ label, value, onChange, placeholder }: FileInputProps) => {
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
      <Label className="text-base font-semibold">{label}</Label>
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
      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={handlePasteChange}
        className="min-h-[120px] font-mono text-sm resize-y"
      />
    </div>
  );
};
