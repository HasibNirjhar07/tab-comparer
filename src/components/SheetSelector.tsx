import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SheetSelectorProps {
  label: string;
  sheets: string[];
  selectedSheet: string;
  onSheetChange: (sheet: string) => void;
}

export const SheetSelector = ({
  label,
  sheets,
  selectedSheet,
  onSheetChange,
}: SheetSelectorProps) => {
  if (sheets.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={selectedSheet} onValueChange={onSheetChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a sheet" />
        </SelectTrigger>
        <SelectContent className="bg-background z-50">
          {sheets.map((sheet) => (
            <SelectItem key={sheet} value={sheet}>
              {sheet}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
