"use client";

/* eslint-disable no-unused-vars */

import type { Resident } from "@/src/lib/careos-types";

type Props = {
  residents: Resident[];
  selectedResidentId: string;
  onSelect: (residentId: string) => void;
};

export function PatientList({ residents, selectedResidentId, onSelect }: Props) {
  return (
    <nav className="patient-list panel" aria-label="patient list">
      <p className="eyebrow">Patients</p>
      <div className="patient-list-items">
        {residents.map((resident) => {
          const selected = resident.id === selectedResidentId;
          return (
            <button
              key={resident.id}
              type="button"
              className={`patient-list-item ${selected ? "selected" : ""}`}
              onClick={() => onSelect(resident.id)}
              aria-current={selected}
            >
              <span className="patient-list-item-name">{resident.name}</span>
              <span className="patient-list-item-room">Room {resident.room}</span>
              <span className="patient-list-item-status">{resident.age} yrs - {resident.timezone}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
