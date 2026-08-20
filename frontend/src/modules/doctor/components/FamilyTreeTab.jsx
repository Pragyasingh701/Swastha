import React, { useEffect, useMemo, useState } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import { Network, AlertTriangle, ShieldCheck, Users } from "lucide-react";
import {
  buildPedigreeTiers,
  computeHereditaryRisks,
  buildScreeningRoadmap,
  idsWithFlaggedConditions,
} from "../utils/hereditaryRisk";

const SEVERITY_STYLES = {
  high: {
    badge: "bg-rose-100 text-rose-700",
    ring: "border-rose-300 ring-1 ring-rose-200",
    label: "High Risk",
  },
  moderate: {
    badge: "bg-amber-100 text-amber-700",
    ring: "border-amber-300 ring-1 ring-amber-200",
    label: "Moderate Risk",
  },
};

function getConditionTone(conditionName) {
  const normalized = String(conditionName || "").toLowerCase();
  if (normalized.includes("diabetes") || normalized.includes("hypertension") || normalized.includes("blood pressure")) {
    return "bg-amber-100 text-amber-700";
  }
  if (normalized.includes("cancer") || normalized.includes("heart") || normalized.includes("coronary") || normalized.includes("stroke")) {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

function MemberCard({ member, flagged, selected, onSelect }) {
  const styles = flagged ? SEVERITY_STYLES[flagged] : null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(member.id)}
      className={`min-w-[170px] rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        styles ? styles.ring : "border-slate-200"
      } ${member.isSelf ? "border-blue-300 bg-blue-50" : ""} ${selected ? "ring-2 ring-blue-400" : ""}`}
    >
      <p className="truncate text-sm font-semibold text-slate-900">{member.name}</p>
      <p className="text-xs text-slate-500">
        {member.isSelf ? "Patient" : member.relationship}
        {member.age != null && member.age !== "" ? ` · ${member.age}y` : ""}
      </p>
      {!member.bloodRelative && !member.isSelf ? (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">Married-in</p>
      ) : null}
      {member.conditions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {member.conditions.slice(0, 3).map((condition, index) => (
            <span
              key={`${condition.name}-${index}`}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getConditionTone(condition.name)}`}
            >
              {condition.name}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

export default function FamilyTreeTab({ members = [], loading = false }) {
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const { tiers, excluded } = useMemo(() => buildPedigreeTiers(members), [members]);
  const risks = useMemo(() => computeHereditaryRisks(members), [members]);
  const roadmap = useMemo(() => buildScreeningRoadmap(risks), [risks]);
  const flaggedIds = useMemo(() => idsWithFlaggedConditions(risks), [risks]);
  const flaggedRisks = risks.filter((risk) => risk.severity === "high" || risk.severity === "moderate");

  useEffect(() => {
    if (!members.length) {
      setSelectedMemberId(null);
      return;
    }

    const selfMember = members.find((member) => member.isSelf || member.relationship?.toLowerCase() === "self");
    const nextId = selfMember?.id || members[0]?.id || null;
    setSelectedMemberId((current) => current && members.some((member) => member.id === current) ? current : nextId);
  }, [members]);

  const selectedMember = members.find((member) => member.id === selectedMemberId) || members[0] || null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 ">
        Loading family tree...
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
        <div className="flex justify-center mb-3">
          <div className="p-3 rounded-full bg-slate-200 ">
            <Network className="text-slate-600" size={20} />
          </div>
        </div>
        <p className="text-sm font-medium text-slate-600 ">No family tree yet</p>
        <p className="text-xs text-slate-500 mt-1">
          Ask the patient to add family members (and known conditions) in their Family Vault.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pedigree Tree */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Network size={16} />
          Family Pedigree
        </h3>
        <p className="mb-3 text-[11px] text-slate-500">
          Access is limited to the verified doctor-patient relationship and should be used as decision support only.
        </p>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
          {tiers.map((tierGroup, idx) => (
            <div key={tierGroup.tier} className="relative">
              {idx > 0 ? (
                <div className="flex justify-center py-3">
                  <div className="w-px h-7 bg-slate-200" />
                </div>
              ) : null}
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 mb-3">
                {tierGroup.label}
              </p>
              <div className="relative flex flex-wrap gap-3">
                <div className="absolute left-0 right-0 top-1/2 hidden h-px -translate-y-1/2 bg-slate-200 md:block" aria-hidden="true" />
                {tierGroup.members.map((member) => (
                  <div key={member.id} className="relative z-10">
                    <MemberCard
                      member={member}
                      selected={selectedMemberId === member.id}
                      onSelect={setSelectedMemberId}
                      flagged={flaggedIds.has(member.id) ? risks.find((r) => r.contributors.some((c) => c.memberId === member.id))?.severity : null}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {excluded.length > 0 ? (
            <p className="mt-4 text-xs text-slate-400">
              Not shown in tree ({excluded.map((m) => m.name).join(", ")}) — relationship isn't a blood/generational
              link.
            </p>
          ) : null}
        </div>

        {selectedMember ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Selected relative</p>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">{selectedMember.name}</h4>
              </div>
              {selectedMember.isSelf ? (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  Patient
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">
                {selectedMember.isSelf ? "Patient" : selectedMember.relationship}
              </span>
              {selectedMember.age != null && selectedMember.age !== "" ? (
                <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">{selectedMember.age} years</span>
              ) : null}
              {!selectedMember.bloodRelative && !selectedMember.isSelf ? (
                <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">Married-in</span>
              ) : null}
            </div>

            {selectedMember.conditions?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedMember.conditions.map((condition, index) => (
                  <span
                    key={`${condition.name}-${index}`}
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ${getConditionTone(condition.name)}`}
                  >
                    {condition.name}
                    {condition.ageOfOnset != null ? ` · onset ${condition.ageOfOnset}` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No diagnosed conditions recorded for this relative.</p>
            )}
          </div>
        ) : null}
      </div>

      {/* Hereditary Risk Radar */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <AlertTriangle size={16} />
          Hereditary Risk Radar
        </h3>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={risks.map((risk) => ({ condition: risk.label, score: risk.score }))}>
                <PolarGrid />
                <PolarAngleAxis dataKey="condition" tick={{ fontSize: 11, fill: "#64748b" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2">
            {flaggedRisks.length === 0 ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                No hereditary risk patterns flagged from the family data on file.
              </p>
            ) : (
              flaggedRisks.map((risk) => (
                <div
                  key={risk.id}
                  className={`rounded-xl border p-3 ${risk.severity === "high" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{risk.label}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLES[risk.severity].badge}`}>
                      {SEVERITY_STYLES[risk.severity].label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {risk.firstDegreeCount} first-degree, {risk.secondDegreeCount} second-degree relative(s)
                    {risk.earliestOnsetAge !== null ? ` · earliest onset age ${risk.earliestOnsetAge}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Preventive Screening Roadmap */}
      {roadmap.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Users size={16} />
            Preventive Screening Roadmap
          </h3>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            {roadmap.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {item.label} — start by age {item.recommendedAge}
                </p>
                <p className="mt-1 text-xs text-slate-600">{item.screeningText}</p>
                <p className="mt-1 text-xs text-slate-500">{item.rationale}</p>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 pt-1">
              Suggested starting point based on family history on file — not a substitute for clinical judgment.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
