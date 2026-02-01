/**
 * Account Selector
 *
 * Shared component for selecting game accounts in LIFF tabs.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AccountSelectorProps {
  readonly accounts: ReadonlyArray<{ game_id: string }>;
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly className?: string;
}

export function AccountSelector({
  accounts,
  value,
  onValueChange,
  className,
}: AccountSelectorProps) {
  if (accounts.length <= 1) return null;

  return (
    <Select value={value || ""} onValueChange={onValueChange}>
      <SelectTrigger className={className ?? "h-9"}>
        <SelectValue placeholder="選擇帳號" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acc) => (
          <SelectItem key={acc.game_id} value={acc.game_id}>
            {acc.game_id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
