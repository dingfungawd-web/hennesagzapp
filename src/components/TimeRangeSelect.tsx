import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_OPTIONS, parseTimeRange, shiftTime } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
  compact?: boolean;
};

export function TimeRangeSelect({ value, onChange, className, compact }: Props) {
  const { start, end } = parseTimeRange(value);
  const triggerCls = compact ? "h-8 text-xs" : "";

  const setStart = (v: string) => {
    if (v === "none") {
      onChange(null);
      return;
    }
    const nextEnd = end && end > v ? end : shiftTime(v, 2);
    onChange(`${v}-${nextEnd}`);
  };

  const setEnd = (v: string) => {
    if (!start) return;
    onChange(v === "none" ? start : `${start}-${v}`);
  };

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Select value={start ?? "none"} onValueChange={setStart}>
        <SelectTrigger className={triggerCls}>
          <SelectValue placeholder="開始" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value="none">未指定</SelectItem>
          {TIME_OPTIONS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={end ?? "none"} onValueChange={setEnd} disabled={!start}>
        <SelectTrigger className={triggerCls}>
          <SelectValue placeholder="結束" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value="none">未指定</SelectItem>
          {TIME_OPTIONS.filter((t) => !start || t.value > start).map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
