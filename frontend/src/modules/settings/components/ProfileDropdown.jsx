import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import SettingsModal from './SettingsModal';
import ChangePasswordModal from './ChangePasswordModal';
import DeleteAccountModal from './DeleteAccountModal';
import {
  User,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Stethoscope,
  KeyRound,
  Trash2,
} from 'lucide-react';

export default function ProfileDropdown({ customProfile }) {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const dropdownRef = useRef(null);

  const profile = customProfile || authUser;

  const displayName = profile?.name || profile?.fullName || 'User Profile';
  const displayEmail = profile?.email || 'user@swastha.ai';
  const displayRole = (profile?.role || 'patient').toLowerCase();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const handleOpenSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleOpenChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
  };

  const handleOpenDeleteAccount = () => {
    setIsOpen(false);
    setIsDeleteAccountOpen(true);
  };

  return (
    <>
      <div className="relative inline-flex items-center" ref={dropdownRef}>
        {/* Header Profile Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-3 pl-3 pr-1 py-1 rounded-xl transition-all duration-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 group focus:outline-none"
          aria-expanded={isOpen}
        >
          {/* Divider line */}
          <div className="h-7 w-px bg-slate-200 dark:bg-slate-700 mr-1 hidden sm:block"></div>

          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight">
              {displayName}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-normal leading-tight mt-0.5 max-w-[170px] truncate">
              {displayEmail}
            </p>
          </div>

          <div className="relative">
            {profile?.picture ? (
              <img
                src={profile.picture}
                alt={displayName}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextSibling) {
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }
                }}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-blue-500 transition-all shadow-xs"
              />
            ) : null}
            <div
              style={{ display: profile?.picture ? 'none' : 'flex' }}
              className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold items-center justify-center text-sm shadow-xs ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-blue-500 transition-all"
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
          </div>

          <ChevronDown
            size={15}
            className={`text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
            }`}
          />
        </button>

        {/* Popover Dropdown Card */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-76 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 shadow-2xl shadow-slate-900/15 dark:shadow-black/40 border border-slate-200/90 dark:border-slate-700/90 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl origin-top-right">
            {/* Top User Info Header */}
            <div className="pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-0.5">
                  Signed in as
                </span>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate leading-tight">
                  {displayName}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                  {displayEmail}
                </p>
              </div>

              {/* Role Badge */}
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wider uppercase px-2.5 py-1 rounded-full border shadow-2xs ${
                  displayRole === 'doctor'
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
                    : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                }`}
              >
                {displayRole === 'doctor' ? (
                  <>
                    <Stethoscope size={11} />
                    DOCTOR
                  </>
                ) : (
                  <>
                    <ShieldCheck size={11} />
                    PATIENT
                  </>
                )}
              </span>
            </div>

            {/* Menu Items */}
            <div className="space-y-1">
              {/* Profile & Settings Trigger -> Opens Modal Popup */}
              <button
                type="button"
                onClick={handleOpenSettings}
                className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-150 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 group text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <User size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Profile & Settings
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    Account, credentials & preferences
                  </p>
                </div>
              </button>

              {/* Forgot / Change Password */}
              <button
                type="button"
                onClick={handleOpenChangePassword}
                className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-150 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 group text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <KeyRound size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Forgot Password
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    Verify OTP & set a new password
                  </p>
                </div>
              </button>

              {/* Delete Account */}
              <button
                type="button"
                onClick={handleOpenDeleteAccount}
                className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-150 hover:bg-rose-50 dark:hover:bg-rose-500/10 group text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-100 dark:border-rose-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <Trash2 size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors">
                    Delete Account
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    Permanently erase all your data
                  </p>
                </div>
              </button>

              {/* Logout System */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-150 hover:bg-rose-50 dark:hover:bg-rose-500/10 group text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-100 dark:border-rose-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <LogOut size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors">
                    Logout System
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    Sign out of active session
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settings Popup Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Forgot / Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Delete Account Modal */}
      <DeleteAccountModal
        isOpen={isDeleteAccountOpen}
        onClose={() => setIsDeleteAccountOpen(false)}
      />
    </>
  );
}
