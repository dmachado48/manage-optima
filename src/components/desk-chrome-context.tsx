"use client";

import { createContext, useContext } from "react";

type DeskChromeValue = {
  openQuickLog: () => void;
};

const DeskChromeContext = createContext<DeskChromeValue>({
  openQuickLog: () => {},
});

export function DeskChromeProvider({
  value,
  children,
}: {
  value: DeskChromeValue;
  children: React.ReactNode;
}) {
  return (
    <DeskChromeContext.Provider value={value}>
      {children}
    </DeskChromeContext.Provider>
  );
}

export function useDeskChrome() {
  return useContext(DeskChromeContext);
}
