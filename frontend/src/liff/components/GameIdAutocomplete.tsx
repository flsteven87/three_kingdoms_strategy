/**
 * Game ID Autocomplete Input
 *
 * Shared autocomplete input for game ID registration.
 * Used in OnboardingFlow and IdManagementPage.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { MemberCandidate } from "../lib/liff-api-client";

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (candidate: MemberCandidate) => void;
  readonly onSubmit: () => void;
  readonly candidates: readonly MemberCandidate[];
  readonly placeholder?: string;
  readonly className?: string;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
}

export function GameIdAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmit,
  candidates,
  placeholder = "例：曹操丞相",
  className = "h-10",
  autoFocus = false,
  disabled = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter candidates based on input
  const filteredCandidates = value.trim()
    ? candidates
        .filter((c) =>
          c.name.toLowerCase().includes(value.toLowerCase().trim()),
        )
        .slice(0, 5)
    : [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (e.target.value.trim()) {
      setIsOpen(true);
    }
  };

  const handleInputFocus = () => {
    if (value.trim()) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filteredCandidates.length === 0) {
      onSubmit();
    }
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (candidate: MemberCandidate) => {
    onSelect(candidate);
    setIsOpen(false);
  };

  return (
    <Popover
      open={isOpen && filteredCandidates.length > 0}
      onOpenChange={setIsOpen}
    >
      <PopoverTrigger asChild>
        <div className="flex-1">
          <Input
            value={value}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={className}
            autoFocus={autoFocus}
            disabled={disabled}
          />
        </div>
      </PopoverTrigger>
      {filteredCandidates.length > 0 && (
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              <CommandGroup>
                {filteredCandidates.map((candidate) => (
                  <CommandItem
                    key={candidate.name}
                    value={candidate.name}
                    onSelect={() => handleSelect(candidate)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{candidate.name}</span>
                      {candidate.group_name && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {candidate.group_name}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
