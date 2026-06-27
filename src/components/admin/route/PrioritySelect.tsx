import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_TONE, type Priority } from "@/lib/route-draft";

export function PriorityBadge({ value }: { value: Priority }) {
  if (value === "normal") return null;
  return (
    <Badge variant="outline" className={`text-[10px] ${PRIORITY_TONE[value]}`}>
      {PRIORITY_LABEL[value]}
    </Badge>
  );
}

export function PrioritySelect({
  value,
  onChange,
  disabled,
  size = "sm",
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Priority)} disabled={disabled}>
      <SelectTrigger className={size === "sm" ? "h-8 w-[130px] text-xs" : "h-9 text-sm"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
