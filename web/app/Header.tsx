"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet";

export function Logo() {
  return (
    <Link href="/" className="logo">
      <span className="logo-mark">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      ShowUp
    </Link>
  );
}

export function Header() {
  const { account, busy, signIn, signOut } = useWallet();
  return (
    <header className="site-header">
      <div className="wrap">
        <Logo />
        <nav className="nav" aria-label="Main">
          <Link href="/#events">Events</Link>
          <Link href="/new">Host</Link>
          <Link href="/sponsor">Sponsor</Link>
          <Link href="/proof">See it work</Link>
          {account && <Link href="/me">My ShowUp</Link>}
          {account ? (
            <button type="button" className="btn btn-small" onClick={() => signOut()} title="Sign out">
              {account.length > 24 ? `${account.slice(0, 10)}…${account.slice(-6)}` : account}
            </button>
          ) : (
            <button type="button" className="btn btn-small btn-dark" onClick={() => signIn()} disabled={busy}>
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
