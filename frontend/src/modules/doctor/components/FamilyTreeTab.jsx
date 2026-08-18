import React, { useMemo } from "react";
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

function MemberCard({ member, flagged }) {
  const styles = flagged ? SEVERITY_STYLES[flagged] : null;

  return (
    <div
      className={`min-w-[160px] rounded-xl border bg-white p-3 shadow-sm ${
        styles ? styles.ring : "border-slate-200"
      } ${member.isSelf ? "bg-blue-50 border-blue-300" : ""}`}
    >
      <p className="text-sm font-semibold text-slate-900 truncate">{member.name}</p>
      <p className="text-xs text-slate-500">
        {member.isSelf ? "Patient" : member.relationship}
        {member.age != null && member.age !== "" ? ` · ${member.age}y` : ""}
      </p>
      {!member.bloodRelative && !member.isSelf ? (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">Married-in</p>
      ) : null}
      {member.conditions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {member.conditions.map((condition, index) => (
            <span
              key={`${condition.name}-${index}`}
              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {condition.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function FamilyTreeTab({ members = [], loading = false }) {
  const { tiers, excluded } = useMemo(() => buildPedigreeTiers(members), [members]);
  const risks = useMemo(() => computeHereditaryRisks(members), [members]);
  const roadmap = useMemo(() => buildScreeningRoadmap(risks), [risks]);
  const flaggedIds = useMemo(() => idsWithFlaggedConditions(risks), [risks]);
  const flaggedRisks = risks.filter((risk) => risk.severity === "high" || risk.severity === "moderate");

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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
          {tiers.map((tierGroup, idx) => (
            <div key={tierGroup.tier}>
              {idx > 0 ? (
                <div className="flex justify-center py-2">
                  <div className="w-px h-6 bg-slate-200" />
                </div>
              ) : null}
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 mb-2">
                {tierGroup.label}
              </p>
              <div className="flex flex-wrap gap-3">
                {tierGroup.members.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    flagged={flaggedIds.has(member.id) ? risks.find((r) => r.contributors.some((c) => c.memberId === member.id))?.severity : null}
                  />
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
