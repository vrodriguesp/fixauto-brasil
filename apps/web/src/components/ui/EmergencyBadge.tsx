'use client';

export default function EmergencyBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
      EMERGÊNCIA
    </span>
  );
}
