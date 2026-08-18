import React, { createContext, useContext } from 'react';

const GoogleAuthStatusContext = createContext(false);

export function GoogleAuthStatusProvider({ blocked, children }) {
  return (
    <GoogleAuthStatusContext.Provider value={blocked}>
      {children}
    </GoogleAuthStatusContext.Provider>
  );
}

export function useGoogleAuthBlocked() {
  return useContext(GoogleAuthStatusContext);
}
