"use client";

import { useCallback, useEffect, useState } from "react";

import { NextNurseView } from "@/src/components/NextNurseView";
import { ProposalGenerator } from "@/src/components/ProposalGenerator";
import { ProposalReview } from "@/src/components/ProposalReview";
import { RealtimeVoiceAgent } from "@/src/components/RealtimeVoiceAgent";
import { RecordInput } from "@/src/components/RecordInput";
import type { CareRecord, LivingCareProfile, Resident } from "@/src/lib/careos-types";

const defaultResident: Resident = {
  name: "Aiko Mori",
  age: 84,
  room: "A-101",
  timezone: "Asia/Tokyo",
  language: "ja",
};

export default function HomePage() {
  const [resident, setResident] = useState<Resident>(defaultResident);
  const [profile, setProfile] = useState<LivingCareProfile | null>(null);
  const [recentRecords, setRecentRecords] = useState<CareRecord[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  const refreshResident = useCallback(() => {
    globalThis
      .fetch("/api/resident")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { resident?: Resident; profile?: LivingCareProfile | null; recentRecords?: CareRecord[] } | null) => {
        if (data?.resident) setResident(data.resident);
        setProfile(data?.profile ?? null);
        if (data?.recentRecords) setRecentRecords(data.recentRecords);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshResident();
  }, [refreshResident]);

  function handleRecordCreated(record: CareRecord) {
    setRecentRecords((previous) => [record, ...previous].slice(0, 10));
  }

  function handleProposalGenerated() {
    setRefreshToken((token) => token + 1);
  }

  function handleApproved() {
    refreshResident();
    setRefreshToken((token) => token + 1);
  }

  const residentLabel = `${resident.name} - Room ${resident.room}`;

  return (
    <main className="app-shell">
      <section className="patient-bar">
        <div>
          <p className="eyebrow">Current resident</p>
          <h1>{residentLabel}</h1>
        </div>
        <div className="patient-meta" aria-label="resident details">
          <span>{resident.age} years</span>
          <span>{resident.language.toUpperCase()}</span>
          <span>{resident.timezone}</span>
        </div>
      </section>

      <section className="workspace">
        <div className="left-rail">
          <RealtimeVoiceAgent />
          <RecordInput onCreated={handleRecordCreated} />
          <ProposalGenerator onGenerated={handleProposalGenerated} />
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
                    </span>
                    <p>{record.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
        <div className="main-column">
          <NextNurseView resident={resident} profile={profile} />
        </div>
        <aside className="review-rail" aria-label="review and approve">
          <ProposalReview refreshToken={refreshToken} onApproved={handleApproved} />
        </aside>
      </section>
    </main>
  );
}
