import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

interface ColumnFilterInputProps {
  value: string;
  onChange: (value: string) => void;
  availableColumns: string[];
}

export const ColumnFilterInput = ({
  value,
  onChange,
  availableColumns,
}: ColumnFilterInputProps) => {
  return (
    <div className="space-y-2 mb-4">
      <Label className="text-sm font-medium">Filter columns in results</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Type column name to filter results..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10"
        />
      </div>
      {value && (
        <p className="text-xs text-muted-foreground">
          Showing columns matching "{value}"
        </p>
      )}
    </div>
  );
};
