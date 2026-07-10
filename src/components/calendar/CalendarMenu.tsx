"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/browser";

/**
 * The 3-dots menu (US-2/US-3/US-4). Four live items in M4:
 *   • Toggle full-month view   • Change month
 *   • Week starts: Mon / Sun    • Logout
 * Download PNG (M9) and Change frame (M8) are omitted until their milestone — the
 * component is built to be trivially extended. Week-start changes keep the menu open
 * so the re-layout is visible; the other actions close it.
 */
export function CalendarMenu({
  open,
  onClose,
  onToggleView,
  onChangeMonth,
  startOfWeek,
  onSetWeekStart,
}: {
  open: boolean;
  onClose: () => void;
  onToggleView: () => void;
  onChangeMonth: () => void;
  startOfWeek: number;
  onSetWeekStart: (value: number) => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  if (!open) return null;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      // Full reload clears client state; the proxy sends the signed-out user to login.
      window.location.assign("/login");
    }
  }

  return (
    <div className="fixed inset-0 z-30" onClick={onClose}>
      <div
        className="absolute right-4 top-16 w-56 overflow-hidden rounded-card border border-line bg-paper shadow-[0_18px_48px_rgba(88,74,58,0.18)]"
        role="menu"
        aria-label="Calendar menu"
        onClick={(e) => e.stopPropagation()}
      >
        <MenuButton
          onClick={() => {
            onToggleView();
            onClose();
          }}
        >
          Toggle full-month view
        </MenuButton>

        <Divider />

        <MenuButton
          onClick={() => {
            onChangeMonth();
            onClose();
          }}
        >
          Change month
        </MenuButton>

        <Divider />

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-ink">Week starts</span>
          <div
            className="flex gap-1 rounded-control border border-line bg-accent-soft p-1"
            role="group"
            aria-label="Week start day"
          >
            {[
              { value: 1, label: "Mon" },
              { value: 7, label: "Sun" },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={startOfWeek === value}
                onClick={() => onSetWeekStart(value)}
                className={`rounded-control px-3 py-1 text-xs font-bold transition-colors ${
                  startOfWeek === value ? "bg-ink text-paper" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Divider />

        <MenuButton onClick={handleLogout} disabled={signingOut}>
          {signingOut ? "Logging out…" : "Logout"}
        </MenuButton>
      </div>
    </div>
  );
}

function MenuButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="block w-full px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:not-disabled:bg-accent-soft disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="h-px bg-line" aria-hidden />;
}
