import React from "react";
import {
  BatteryFull, BookOpen, ChevronRight, Flag, House, Map, Signal, UserRound, Wifi,
} from "lucide-react";
import "./_group.css";

const tabs = [
  { name: "Home", Icon: House },
  { name: "Wars", Icon: Flag },
  { name: "Map", Icon: Map },
  { name: "Passport", Icon: BookOpen },
  { name: "Profile", Icon: UserRound },
];

function StatusBar() {
  return (
    <div className="pwp-status" aria-label="9:41, full cellular signal, Wi-Fi and battery">
      <span>9:41</span>
      <span className="pwp-status-right" aria-hidden="true">
        <Signal size={13} /><Wifi size={13} /><BatteryFull size={16} />
      </span>
    </div>
  );
}

function BrandHeader() {
  return (
    <header className="pwp-header">
      <div className="pwp-brand" aria-label="Pint Wars">
        <img className="pwp-crest" src="/__mockup/images/pw-reference-crest.png" alt="" />
        <img className="pwp-wordmark" src="/__mockup/images/pw-reference-wordmark.png" alt="Pint Wars" />
      </div>
      <span className="pwp-header-label">YOUR ACCOUNT</span>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="pwp-nav" aria-label="Main navigation">
      {tabs.map(({ name, Icon }) => (
        <button className={`pwp-nav-item${name === "Profile" ? " is-current" : ""}`} type="button" key={name}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
          <span>{name}</span>
        </button>
      ))}
    </nav>
  );
}

export function Current() {
  return (
    <main className="pwp pwp-current">
      <div className="pwp-screen">
        <StatusBar />
        <BrandHeader />
        <div className="pwp-content">
          <h1 className="pwp-current-title">Profile</h1>
          <section className="pwp-current-card" aria-label="Profile details">
            <h2 className="pwp-current-card-title">Your account</h2>
            <span className="pwp-current-email">steven.costa@example.com</span>
            <label className="pwp-current-field-label" htmlFor="pwp-display-name">Display name</label>
            <input className="pwp-current-input" id="pwp-display-name" value="Steven Costa" readOnly />
            <button className="pwp-current-button" type="button">Save profile</button>
          </section>
          <section className="pwp-current-card" aria-label="Privacy and support">
            <h2 className="pwp-current-card-title">Privacy and support</h2>
            {["Privacy Policy", "Support", "Account deletion details"].map((label) => (
              <button className="pwp-current-button pwp-current-button--quiet" type="button" key={label}>
                <span>{label}</span><ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </section>
          <section className="pwp-current-card" aria-label="Delete account">
            <h2 className="pwp-current-card-title">Delete Account</h2>
            <p className="pwp-current-deletion">
              This permanently deletes your Pint Wars sign-in and removes its link to your history. Pint-proof photos and personal visit coordinates are removed. League and score history, plus purchase verification records, remain under “Deleted player.” RevenueCat customer data is not removed by this request in the current setup.
            </p>
            <button className="pwp-current-button pwp-current-button--danger" type="button" style={{ marginTop: 13 }}>
              Delete Account
            </button>
          </section>
          <button className="pwp-current-button pwp-current-button--quiet" type="button">Sign out</button>
          <p className="pwp-current-disclaimer">Sandbox preview · actions are visual only</p>
        </div>
        <BottomNav />
        <div className="pwp-home-indicator" aria-hidden="true" />
      </div>
    </main>
  );
}
