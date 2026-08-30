import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";

export default function ResponsiveSidebar({
  navItems,
  action,
  onOpenSettings,
  className = "bg-slate-50",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navigateTo = (handler) => {
    setIsOpen(false);
    handler?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 lg:hidden"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
      >
        <Menu size={22} />
      </button>

      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-slate-200 px-4 py-6 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none ${isOpen ? "translate-x-0" : ""} ${className}`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Logo />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, active, route, onClick }) => {
            const isActive = Boolean(active) || Boolean(route && (
              location.pathname === route || location.pathname.startsWith(`${route}/`)
            ));
            return (
              <button
                key={label}
                type="button"
                onClick={() => navigateTo(onClick || (() => route && navigate(route)))}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {typeof Icon === "string" ? (
                  <span className="material-symbols-outlined text-[18px]">{Icon}</span>
                ) : (
                  <Icon size={18} />
                )}
                {label}
              </button>
            );
          })}
        </nav>

        {action && (
          <button
            type="button"
            onClick={() => navigateTo(action.onClick || (() => action.route && navigate(action.route)))}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            {action.icon && <action.icon size={18} />}
            {action.label}
          </button>
        )}

        {onOpenSettings && (
          <div className="space-y-1 border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={() => navigateTo(onOpenSettings)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              Settings
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
