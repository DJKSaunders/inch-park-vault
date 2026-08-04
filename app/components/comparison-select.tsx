"use client";

import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";

type SelectOption = {
  id: string;
  label: string;
};

export function ComparisonSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabledKeys = [],
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder: string;
  disabledKeys?: string[];
}) {
  return (
    <Select
      className="comparison-filter-select"
      aria-label={label}
      value={value}
      onChange={(nextValue) =>
        onChange(nextValue === null ? null : String(nextValue))
      }
      disabledKeys={disabledKeys}
    >
      <Label>{label}</Label>
      <Button className="comparison-filter-trigger">
        <SelectValue>
          {({ selectedItems }) =>
            (selectedItems?.[0] as { textValue?: string } | undefined)
              ?.textValue ?? placeholder
          }
        </SelectValue>
        <span aria-hidden="true">⌄</span>
      </Button>
      <Popover className="comparison-filter-popover">
        <ListBox className="comparison-filter-listbox" items={options}>
          {(item) => (
            <ListBoxItem
              className="comparison-filter-option"
              id={item.id}
              textValue={item.label}
            >
              {({ isSelected }) => (
                <>
                  <span className="comparison-filter-check">
                    {isSelected ? "✓" : ""}
                  </span>
                  {item.label}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function ComparisonTeamSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
}) {
  const items = options.map((label) => ({ id: label, label }));
  return (
    <Select
      className="comparison-filter-select"
      aria-label="Teams"
      selectionMode="multiple"
      value={value}
      onChange={(nextValue) => onChange(nextValue.map(String))}
    >
      <Label>Teams</Label>
      <Button className="comparison-filter-trigger">
        <SelectValue>
          {({ selectedItems }) =>
            selectedItems?.length
              ? `${selectedItems.length} team${selectedItems.length === 1 ? "" : "s"} selected`
              : "All teams"
          }
        </SelectValue>
        <span aria-hidden="true">⌄</span>
      </Button>
      <Popover className="comparison-filter-popover">
        <ListBox className="comparison-filter-listbox" items={items}>
          {(item) => (
            <ListBoxItem
              className="comparison-filter-option"
              id={item.id}
              textValue={item.label}
            >
              {({ isSelected }) => (
                <>
                  <span className="comparison-filter-check">
                    {isSelected ? "✓" : ""}
                  </span>
                  {item.label}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
