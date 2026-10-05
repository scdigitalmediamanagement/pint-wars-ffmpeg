import React, { useEffect, useState } from "react";
import {
  Bell, Beer, Flag, House, Map, UsersRound, BookOpen,
  UserRound, Wifi, BatteryFull, Signal, ChevronRight, ArrowRight,
} from "lucide-react";
import "./home.css";

type HomePhoneProps = { active: boolean };

function Crest() {
  return (
    <span className="pwh-crest" aria-hidden="true">
      <img src="/__mockup/images/pw-reference-crest.png" alt="" />
    </span>
  );
}

function StatusBar() {
  return (
    <div className="pwh-status" aria-label="9:41, full signal, Wi-Fi, battery">
      <span>9:41</span>
      <span className="pwh-status-right"><Signal size={12} fill="currentColor" /><Wifi size={12} /><BatteryFull size={15} fill="currentColor" /></span>
    </div>
  );
}

function BottomNav({ onPick }: { onPick: (item: string) => void }) {
  const entries = [
    { label: "Home", Icon: House },
    { label: "Wars", Icon: Flag },
    { label: "Map", Icon: Map },
    { label: "Passport", Icon: BookOpen },
    { label: "Profile", Icon: UserRound },
  ];
  return (
    <nav className="pwh-nav" aria-label="Main navigation">
      {entries.map(({ label, Icon }) => (
        <button key={label} className={`pwh-nav-item${label === "Home" ? " active" : ""}`} onClick={() => label !== "Home" && onPick(`${label} is ready for your next visit.`)} aria-current={label === "Home" ? "page" : undefined}>
          <Icon size={23} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function ActionCard({ icon, title, subtitle, onClick }: { icon: "plus" | "join"; title: string; subtitle: string; onClick: () => void }) {
  const Icon = icon === "plus" ? Flag : UsersRound;
  return (
    <button className="pwh-action" onClick={onClick}>
      <span className="pwh-action-icon"><Icon size={25} strokeWidth={1.7} /></span>
      <span className="pwh-action-copy">
        <span className="pwh-action-title">{title}</span>
        <span className="pwh-action-sub">{subtitle}</span>
      </span>
    </button>
  );
}

function ActiveHero({ onClick }: { onClick: () => void }) {
  return (
    <section className="pwh-hero" aria-label="Live Pint War: Devon Crew">
      <img className="pwh-photo" src="/__mockup/images/pw-home-pints.jpg" alt="Friends raising pints together in a warmly lit Devon pub" />
      <div className="pwh-photo-shade" />
      <div className="pwh-hero-content">
        <div className="pwh-live"><i /> LIVE PINT WAR</div>
        <h2 className="pwh-hero-name">Devon Crew</h2>
        <div className="pwh-meta"><span>Day 4 of 7</span><i className="pwh-meta-sep" /><span>6 players</span></div>
        <div className="pwh-hero-spacer" />
        <div className="pwh-scoreline">
          <div className="pwh-stat">
            <span className="pwh-stat-label">YOUR POSITION</span>
            <strong className="pwh-stat-value">3rd</strong>
          </div>
          <div className="pwh-stat pwh-stat-score">
            <span className="pwh-stat-label">YOUR SCORE</span>
            <strong className="pwh-stat-value">7</strong>
          </div>
        </div>
        <div className="pwh-progress-wrap"><div className="pwh-progress"><div className="pwh-progress-fill" /></div></div>
        <div className="pwh-remaining">3 days remaining</div>
        <button className="pwh-cta" onClick={onClick}>View Pint War <ArrowRight size={19} strokeWidth={2.4} /></button>
      </div>
    </section>
  );
}

function EmptyHero({ onClick }: { onClick: () => void }) {
  return (
    <section className="pwh-hero" aria-label="Start a Pint War with friends">
      <img className="pwh-photo" src="/__mockup/images/pw-home-pints.jpg" alt="A pair of golden pints ready to share at the pub" />
      <div className="pwh-photo-shade" />
      <div className="pwh-hero-content">
        <div className="pwh-empty-stamp"><Beer size={14} /> NO ACTIVE PINT WAR</div>
        <div className="pwh-hero-spacer" />
        <h2 className="pwh-hero-name">The pub is calling.</h2>
        <p className="pwh-empty-message">Bring your mates together, visit local pubs and see who comes out on top.</p>
        <button className="pwh-cta" onClick={onClick}>Start a Pint War <ArrowRight size={19} strokeWidth={2.4} /></button>
      </div>
    </section>
  );
}

export function HomePhone({ active }: HomePhoneProps) {
  const [toast, setToast] = useState("");
  const [bellOn, setBellOn] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast(message);
  return (
    <main className={`pwh${active ? "" : " pwh-empty"}`}>
      <div className="pwh-screen">
        <StatusBar />
        <header className="pwh-header">
          <div className="pwh-mark"><Crest /><div className="pwh-wordmark"><img src="/__mockup/images/pw-reference-wordmark.png" alt="Pint Wars" /></div></div>
          <button className="pwh-bell" aria-label="Notifications" onClick={() => { setBellOn(!bellOn); notify(bellOn ? "Notifications muted" : "You’re all caught up"); }}>
            <Bell size={20} strokeWidth={1.8} />{active && <i className="pwh-bell-dot" />}
          </button>
        </header>
        <h1 className="pwh-title">Ready for your next war?</h1>
        {active ? <ActiveHero onClick={() => notify("Devon Crew · Day 4 of 7")} /> : <EmptyHero onClick={() => notify("Let’s get your friends together")} />}
        <section className="pwh-section" aria-label="Quick actions">
          <h2 className="pwh-section-head">QUICK ACTIONS</h2>
          <div className="pwh-actions">
            <ActionCard icon="plus" title="Create a Pint War" subtitle="Start with friends" onClick={() => notify("Create a Pint War")} />
            <ActionCard icon="join" title="Join a Pint War" subtitle="Use an invite code" onClick={() => notify("Enter your invite code")} />
          </div>
        </section>
        <button className="pwh-discover" onClick={() => notify("Discover pubs near you")}>
          <span className="pwh-discover-copy">
            <span className="pwh-discover-title">DISCOVER A NEW PUB</span>
            <span className="pwh-discover-sub">Find great pubs near you that<br />you haven’t visited yet.</span>
          </span>
          <span className="pwh-discover-map" aria-hidden="true">
            <svg viewBox="0 0 105 100" fill="none">
              <path fill="#19252c" d="M34 0h71v100H0z" />
              <path stroke="#3c7040" strokeWidth="5" d="m65-8-6 38 45 16M83 4l-6 14 17 10M4 80l28-8 19 26m48-25-24 17" />
              <path stroke="#6d757b" strokeWidth="1.5" d="m34 10 16 18-5 10-14-3-9 19 17 22 42 18m-2-84-10 30 32 16-9 20-37-9-16 9" />
              <path fill="#ffc92c" d="M69 22c-8 0-14 6-14 14 0 11 14 26 14 26s14-15 14-26c0-8-6-14-14-14Z" />
              <circle cx="69" cy="36" r="5" fill="#19252c" />
              <path fill="#4bb13b" d="M30 56c-6 0-11 5-11 11 0 8 11 20 11 20s11-12 11-20c0-6-5-11-11-11Z" />
              <circle cx="30" cy="66" r="4" fill="#19252c" />
            </svg>
          </span>
        </button>
        <BottomNav onPick={notify} />
        <div className="pwh-home-indicator" />
        {toast && <div className="pwh-toast" role="status">{toast}</div>}
      </div>
    </main>
  );
}
