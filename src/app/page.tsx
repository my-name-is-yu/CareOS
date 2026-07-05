"use client";

import { useCallback, useEffect, useState } from "react";

import { NextNurseView } from "@/src/components/NextNurseView";
import { PatientList } from "@/src/components/PatientList";
import { ProposalGenerator } from "@/src/components/ProposalGenerator";
import { ProposalReview } from "@/src/components/ProposalReview";
import { RealtimeVoiceAgent } from "@/src/components/RealtimeVoiceAgent";
import { RecordInput } from "@/src/components/RecordInput";
import type { CareRecord, LivingCareProfile, Resident } from "@/src/lib/careos-types";

const DEFAULT_RESIDENT_ID = "aiko-mori";

const fallbackResident: Resident = {
  id: DEFAULT_RESIDENT_ID,
  name: "Aiko Mori",
  age: 84,
  room: "A-101",
  timezone: "Asia/Tokyo",
  language: "ja",
};

export default function HomePage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<string>(DEFAULT_RESIDENT_ID);
  const [resident, setResident] = useState<Resident>(fallbackResident);
  const [profile, setProfile] = useState<LivingCareProfile | null>(null);
  const [recentRecords, setRecentRecords] = useState<CareRecord[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    globalThis
      .fetch("/api/residents")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { residents?: Resident[] } | null) => {
        if (data?.residents) setResidents(data.residents);
      })
      .catch(() => {});
  }, []);

  const refreshResident = useCallback((residentId: string) => {
    globalThis
      .fetch(`/api/resident?residentId=${encodeURIComponent(residentId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { resident?: Resident; profile?: LivingCareProfile | null; recentRecords?: CareRecord[] } | null) => {
        if (data?.resident) setResident(data.resident);
        setProfile(data?.profile ?? null);
        setRecentRecords(data?.recentRecords ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshResident(selectedResidentId);
  }, [refreshResident, selectedResidentId]);

  function handleSelectResident(residentId: string) {
    setSelectedResidentId(residentId);
    setRefreshToken((token) => token + 1);
  }

  function handleRecordCreated(record: CareRecord) {
    setRecentRecords((previous) => [record, ...previous].slice(0, 10));
  }

  function handleProposalGenerated() {
    setRefreshToken((token) => token + 1);
  }

  function handleApproved() {
    refreshResident(selectedResidentId);
    setRefreshToken((token) => token + 1);
  }

  return (
    <main className="app-shell">
      <section className="shell-header">
        <div>
          <p className="eyebrow">Current resident</p>
          <h1>
            {resident.name} - Room {resident.room}
          </h1>
        </div>
        <div className="patient-meta" aria-label="resident details">
          <span>{resident.age} years</span>
          <span>{resident.language.toUpperCase()}</span>
          <span>{resident.timezone}</span>
          {profile ? (
            <>
              <span>v{profile.version}</span>
              <span>approved by {profile.approvedBy}</span>
              <span>{new Date(profile.approvedAt).toLocaleString()}</span>
            </>
          ) : null}
        </div>
      </section>

      <PatientList residents={residents} selectedResidentId={selectedResidentId} onSelect={handleSelectResident} />

      <div className="center-column">
        <NextNurseView resident={resident} profile={profile} />
        <ProposalReview residentId={selectedResidentId} refreshToken={refreshToken} onApproved={handleApproved} />
      </div>

      <aside className="intake-rail" aria-label="voice and record intake">
        <RealtimeVoiceAgent residentId={selectedResidentId} />
        <RecordInput residentId={selectedResidentId} onCreated={handleRecordCreated} />
        <ProposalGenerator residentId={selectedResidentId} onGenerated={handleProposalGenerated} />
        <section className="panel">
          <p className="eyebrow">Recent care records</p>
          <div className="record-list">
            {recentRecords.length === 0 ? (
              <p className="muted-line">No care records yet.</p>
            ) : (
              recentRecords.map((record) => (
                <div className="record-list-item" key={record.id}>
                  <span>
                    {record.type.replace(/_/g, " ")} - {new Date(record.occurredAt).toLocaleString()}
                    {record.author.name ? ` - ${record.author.name} (${record.author.role})` : ` - ${record.author.role}`}
                  </span>
                  <p>{record.body}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>
    </main>
  );
}
