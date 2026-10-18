import React from "react";
import NotificationBell from "./NotificationBell";
import PatientIdBadge from "./PatientIdBadge";
import ProfileDropdown from "../../modules/settings/components/ProfileDropdown";

/**
 * The bar across the top of every signed-in page: notification bell, the
 * patient's shareable ID (it renders nothing for doctors), and the profile menu.
 *
 * `profile` is an optional just-fetched profile that the badge and menu show in
 * place of the cached login user. `children` are extra controls placed before the
 * bell (for example the AI notice link). `shadow` adds the soft shadow some pages use.
 */
export default function AppHeader({ profile, children, shadow = false }) {
  return (
    <header
      className={`shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white${shadow ? " shadow-sm" : ""}`}
    >
      {children}
      <NotificationBell />
      <PatientIdBadge customProfile={profile} />
      <ProfileDropdown customProfile={profile} />
    </header>
  );
}
