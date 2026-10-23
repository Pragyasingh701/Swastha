import React, { useCallback, useEffect, useState } from "react";

import ResponsiveSidebar from "../../../components/common/ResponsiveSidebar";
import { openSettings } from "../../../components/common/settingsEvents";
import { getIntakeQueue } from "../../../api/doctorPatients";
import { usePolling } from "../../../hooks/usePolling";

const navItems = [
  { label: "Dashboard", icon: "dashboard", route: "/doctor-dashboard" },
  { label: "Intake Queue", icon: "assignment", route: "/doctor/intake-queue" },
  { label: "Patients", icon: "groups", route: "/doctor/patients" },
  { label: "AI Insights", icon: "smart_toy", route: "/doctor/clinical-intelligence" },
  { label: "Ask Swastha", icon: "auto_awesome", route: "/doctor/ask-swastha" },
];

export default function DoctorSidebar() {
  // How many patients are waiting in the intake queue, and whether any is a red flag, so
  // it shows on every doctor page, not only on the queue itself.
  const [queue, setQueue] = useState({ waiting: 0, flagged: 0 });

  const refreshQueue = useCallback(async () => {
    try {
      const sessions = await getIntakeQueue();
      setQueue({
        waiting: sessions.length,
        flagged: sessions.filter((s) => s.priority === "flagged").length,
      });
    } catch {
      // Keep the last count; this is only a hint, and the queue page shows real errors.
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  usePolling(refreshQueue, { intervalMs: 120000 });

  const items = navItems.map((item) =>
    item.route === "/doctor/intake-queue"
      ? { ...item, badge: { count: queue.waiting, urgent: queue.flagged > 0 } }
      : item
  );

  return <ResponsiveSidebar navItems={items} onOpenSettings={openSettings} className="bg-white" />;
}
