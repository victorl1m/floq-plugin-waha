import { createContext, useContext } from "react";
import type { Account } from "./context";

export interface Accounts {
  list: Account[];
  /** Session of the account on screen ("" when there is none). */
  active: string;
  switchTo(session: string): void;
  refresh(): Promise<void>;
  /** Opens the "Add account" dialog. */
  add(): void;
}
/** Null outside the inbox (the demos): the account menu then shows the one session it has. */
export const AccountsContext = createContext<Accounts | null>(null);
export const useAccounts = () => useContext(AccountsContext);
