"use client";

import { EvidenceList } from "@/src/components/EvidenceList";
import { TrendFlagCard } from "@/src/components/TrendFlagCard";
import type { LivingCareProfile, Resident } from "@/src/lib/careos-types";

type Props = {
  resident: Resident;
  profile: LivingCareProfile | null;
};

function updatedClass(updatedInVersion: number, currentVersion: number): string {
  return updatedInVersion === currentVersion ? "field-card field-updated" : "field-card";
}

export function NextNurseView({ resident, profile }: Props) {
  if (!profile) {
    return (
      <section className="panel next-nurse-view">
        <p className="eyebrow">Next nurse view</p>
        <p className="muted-line">No approved Living Care Profile yet for {resident.name}.</p>
      </section>
    );
  }

  const version = profile.version;

  return (
    <section className="next-nurse-view" aria-live="polite">
      <header className="shift-header">
        <div>
          <p className="eyebrow">Next nurse view</p>
          <h2>{resident.name}&apos;s living care profile</h2>
        </div>
        <div className="profile-meta" aria-label="profile version details">
          <span>v{version}</span>
          <span>approved by {profile.approvedBy}</span>
          <span>{new Date(profile.approvedAt).toLocaleString()}</span>
        </div>
      </header>

      <article className={`panel ${updatedClass(profile.personSummary.updatedInVersion, version)}`}>
        <h3>Person summary</h3>
        <p>{profile.personSummary.value}</p>
        <EvidenceList citations={profile.personSummary.citations} />
      </article>

      <article className={`panel ${updatedClass(profile.recentChanges.updatedInVersion, version)}`}>
        <h3>Recent changes</h3>
        <div className="stack">
          {profile.recentChanges.value.length === 0 ? (
            <p className="muted-line">No recent changes recorded.</p>
          ) : (
            profile.recentChanges.value.map((change, i) => (
              <div key={`${change.description}-${i}`} className="change-item">
                <span className={`direction-badge direction-${change.direction}`}>{change.direction}</span>
                <p>{change.description}</p>
                <EvidenceList citations={change.citations} />
              </div>
            ))
          )}
        </div>
      </article>

      <div className="field-grid">
        <article className={`panel ${updatedClass(profile.calmingApproaches.updatedInVersion, version)}`}>
          <h3>Calming approaches</h3>
          <ul>
            {profile.calmingApproaches.value.map((item, i) => (
              <li key={`${i}-${item}`}>{item}</li>
            ))}
          </ul>
          <EvidenceList citations={profile.calmingApproaches.citations} />
        </article>

        <article className={`panel ${updatedClass(profile.knownTriggers.updatedInVersion, version)}`}>
          <h3>Known triggers</h3>
          <ul>
            {profile.knownTriggers.value.map((item, i) => (
              <li key={`${i}-${item}`}>{item}</li>
            ))}
          </ul>
          <EvidenceList citations={profile.knownTriggers.citations} />
        </article>
      </div>

      <article className={`panel ${updatedClass(profile.careRecommendations.updatedInVersion, version)}`}>
        <h3>Care recommendations</h3>
        <div className="stack">
          {profile.careRecommendations.value.length === 0 ? (
            <p className="muted-line">No care recommendations recorded.</p>
          ) : (
            profile.careRecommendations.value.map((item, i) => (
              <div key={`${item.situation}-${i}`} className="recommendation-item">
                <p>
                  <strong>{item.situation}</strong>
                </p>
                <p>{item.approach}</p>
                <EvidenceList citations={item.citations} />
              </div>
            ))
          )}
        </div>
      </article>

      <article className={`panel ${updatedClass(profile.handoffBrief.updatedInVersion, version)}`}>
        <h3>Handoff brief</h3>
        <p>{profile.handoffBrief.value}</p>
        <EvidenceList citations={profile.handoffBrief.citations} />
      </article>

      <article className={`panel ${updatedClass(profile.trendFlags.updatedInVersion, version)}`}>
        <h3>Trend flags</h3>
        <div className="stack">
          {profile.trendFlags.value.length === 0 ? (
            <p className="muted-line">No trend flags recorded.</p>
          ) : (
            profile.trendFlags.value.map((flag, i) => <TrendFlagCard key={`${flag.claim}-${i}`} flag={flag} />)
          )}
        </div>
      </article>
    </section>
  );
}
