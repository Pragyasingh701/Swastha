// "For Doctors & Clinics" on the landing page starts a doctor sign-up. A doctor account is
// created in two steps (create the login first, then fill in the doctor details), and the
// details page needs a login, so the landing page cannot link straight to it. The choice is
// remembered for this browser session and used when the doctor reaches role selection.
const KEY = "swastha_intended_role";

export function setIntendedRole(role) {
  try {
    sessionStorage.setItem(KEY, role);
  } catch {
    /* storage unavailable: the person simply chooses their role on the next screen */
  }
}

export function getIntendedRole() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearIntendedRole() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
