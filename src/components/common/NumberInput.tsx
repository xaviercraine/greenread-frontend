"use client";

import { InputHTMLAttributes, useEffect, useRef, useState } from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max"
> & {
  value: number;
  onChange: (value: number) => void;
  /** When true, parse as integer; otherwise parse as float. Default false. */
  integer?: boolean;
  min?: number;
  max?: number;
};

/**
 * Number input that solves the "stuck zero" problem and enforces min/max:
 * - Display value is held as a string locally.
 * - onFocus: if the value is "0", the field is cleared so the user can type without backspacing.
 * - onBlur: if empty, restored to "0". If outside [min, max], clamped to the bound.
 * - onChange: the display string is updated directly; the parent receives the parsed number.
 * - Sets the native max/min attributes so spinners and form validation respect them.
 */
export default function NumberInput({
  value,
  onChange,
  onFocus,
  onBlur,
  integer = false,
  min,
  max,
  ...rest
}: Props) {
  const [display, setDisplay] = useState<string>(String(value ?? 0));
  const focusedRef = useRef(false);

  // Sync external value changes when not focused.
  useEffect(() => {
    if (!focusedRef.current) {
      setDisplay(String(value ?? 0));
    }
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={display}
      onFocus={(e) => {
        focusedRef.current = true;
        if (display === "0") {
          setDisplay("");
        }
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        if (display === "") {
          setDisplay("0");
          if (value !== 0) onChange(0);
          onBlur?.(e);
          return;
        }
        const parsed = integer ? parseInt(display, 10) : parseFloat(display);
        if (Number.isNaN(parsed)) {
          setDisplay(String(value ?? 0));
          onBlur?.(e);
          return;
        }
        let clamped = parsed;
        if (typeof max === "number" && clamped > max) clamped = max;
        if (typeof min === "number" && clamped < min) clamped = min;
        if (clamped !== parsed) {
          setDisplay(String(clamped));
          onChange(clamped);
        } else if (clamped !== value) {
          // Ensure parent state is in sync (e.g. if user typed but onChange skipped)
          onChange(clamped);
        }
        onBlur?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "" || next === "-") {
          setDisplay(next);
          // Defer numeric update until blur or further input.
          return;
        }
        const parsed = integer ? parseInt(next, 10) : parseFloat(next);
        if (Number.isNaN(parsed)) {
          setDisplay(next);
          return;
        }
        if (typeof max === "number" && parsed > max) {
          setDisplay(String(max));
          if (value !== max) onChange(max);
          return;
        }
        setDisplay(next);
        onChange(parsed);
      }}
    />
  );
}
