import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/I18nProvider";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Optional secondary text shown below the label for disambiguation. */
  hint?: string | null;
};

/**
 * Generic single-select combobox on top of cmdk + Popover.
 *
 * The caller supplies `options`. Filtering is done by cmdk using label + hint.
 * Use `clearable` when `null` is a legal value (e.g. "unassigned device").
 */
export function EntityCombobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  loading = false,
  disabled = false,
  clearable = false,
  clearLabel,
  id,
  ariaInvalid,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  clearLabel?: string;
  id?: string;
  ariaInvalid?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid || undefined}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {loading
              ? t("combobox.loading")
              : (selected?.label ?? placeholder ?? t("combobox.placeholder"))}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command
          // We pre-compose searchable text into each option's value below so
          // cmdk's default filter matches both label and hint content.
          filter={(value, search) => {
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder ?? t("combobox.searchPlaceholder")} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("combobox.loading")}
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText ?? t("combobox.empty")}</CommandEmpty>
                {clearable && (
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      onSelect={() => {
                        onChange(null);
                        setOpen(false);
                      }}
                      className="text-muted-foreground"
                    >
                      <X className="mr-2 h-4 w-4" aria-hidden />
                      {clearLabel ?? t("combobox.clear")}
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {options.map((opt) => {
                    // Encode both label and hint into the cmdk value so that
                    // filtering by the hint (e.g. paper field) also matches.
                    const searchValue = [opt.label, opt.hint ?? ""].join(" ").trim();
                    const active = opt.value === value;
                    return (
                      <CommandItem
                        key={opt.value}
                        value={searchValue}
                        onSelect={() => {
                          onChange(opt.value);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            active ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="truncate">{opt.label}</div>
                          {opt.hint && (
                            <div className="truncate text-xs text-muted-foreground">
                              {opt.hint}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
