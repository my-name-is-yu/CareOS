"use client";

/* eslint-disable no-unused-vars */

type Props = {
  selectedMode: "off" | "on";
  onChange: (_mode: "off" | "on") => void;
};

export function ModeToggle({ selectedMode, onChange }: Props) {
  return (
    <div className="segmented" role="tablist" aria-label="Memory mode">
      <button
        type="button"
        className={selectedMode === "off" ? "segmented-item active" : "segmented-item"}
        onClick={() => onChange("off")}
        aria-pressed={selectedMode === "off"}
      >
        MEMORY OFF
      </button>
      <button
        type="button"
        className={selectedMode === "on" ? "segmented-item active" : "segmented-item"}
        onClick={() => onChange("on")}
        aria-pressed={selectedMode === "on"}
      >
        MEMORY ON
      </button>
    </div>
  );
}
