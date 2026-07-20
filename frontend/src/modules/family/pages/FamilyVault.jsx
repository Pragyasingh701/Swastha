import React from "react";

export default function FamilyVault() {
  return (
    <div className="min-h-screen bg-background text-on-surface p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-headline-lg text-headline-lg font-bold text-primary mb-4">Family Health Vault</h1>
        <p className="text-body-md text-on-surface-variant mb-6">Manage health records for your entire family in one place.</p>
        <div className="p-6 bg-white border border-outline-variant/30 rounded-2xl shadow-sm">
          <p className="text-on-surface-variant">Vault records listing placeholder</p>
        </div>
      </div>
    </div>
  );
}
