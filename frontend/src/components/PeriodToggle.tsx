import type { TrendingPeriod } from "../api/home";
import { Tabs, type TabOption } from "./Tabs";

const OPTIONS: TabOption<TrendingPeriod>[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

interface PeriodToggleProps {
  value: TrendingPeriod;
  onChange: (value: TrendingPeriod) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <Tabs
      options={OPTIONS}
      value={value}
      onChange={onChange}
      variant="subtle"
      ariaLabel="Time period"
    />
  );
}
