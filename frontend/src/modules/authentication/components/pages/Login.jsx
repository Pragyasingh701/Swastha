import React from "react";

export default function Login() {
  return (
    <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-outline-variant/30 shadow-md text-center">
        <h2 className="font-headline-md text-headline-md text-primary font-bold mb-4">Login to Swastha</h2>
        <p className="text-body-md text-on-surface-variant mb-6">Access your digital health vault.</p>
        <button className="w-full bg-primary text-on-primary py-3 px-6 rounded-xl font-semibold hover:bg-primary/95 transition-all">
          Continue
        </button>
      </div>
    </div>
  );
}
