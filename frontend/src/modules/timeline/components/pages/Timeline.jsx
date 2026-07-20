import React from "react";
import { useParams } from "react-router-dom";

export default function Timeline() {
  const { profileId } = useParams();
  return (
    <div className="min-h-screen bg-background text-on-surface p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-headline-lg text-headline-lg font-bold text-primary mb-4">Patient Health Timeline</h1>
        <p className="text-body-md text-on-surface-variant mb-6">Chronological health history for profile: {profileId}</p>
        <div className="p-6 bg-white border border-outline-variant/30 rounded-2xl shadow-sm">
          <p className="text-on-surface-variant">Timeline events visualization placeholder</p>
        </div>
      </div>
    </div>
  );
}
