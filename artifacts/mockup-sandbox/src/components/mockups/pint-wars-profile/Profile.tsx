import React from "react";
import {
  BatteryFull, BookOpen, ChevronRight, CircleHelp, Flag, House, Map, MapPin,
  Pencil, ShieldCheck, Signal, Star, UserRound, Wifi,
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
        <Signal size={13} strokeWidth={2.4} />
        <Wifi size={13} strokeWidth={2.3} />
        <BatteryFull size={16} strokeWidth={2.2} />
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
      <span className="pwp-header-label">MEMBER PROFILE</span>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="pwp-nav" aria-label="Main navigation">
      {tabs.map(({ name, Icon }) => (
        <button
          className={`pwp-nav-item${name === "Profile" ? " is-current" : ""}`}
          type="button"
          key={name}
          aria-current={name === "Profile" ? "page" : undefined}
        >
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
          <span>{name}</span>
        </button>
      ))}
    </nav>
  );
}

function ProfileRow({
  icon: Icon,
  title,
  subtitle,
  tone,
  comingSoon,
}: {
  icon: typeof Pencil;
  title: string;
  subtitle?: string;
  tone?: "quiet" | "danger";
  comingSoon?: boolean;
}) {
  const className = [
    "pwp-row",
    tone === "quiet" ? "pwp-row--quiet" : "",
    tone === "danger" ? "pwp-row--danger" : "",
    comingSoon ? "pwp-row--soon" : "",
  ].filter(Boolean).join(" ");
  return (
    <button className={className} type="button" aria-disabled={comingSoon || undefined}>
      <span className="pwp-row-icon"><Icon size={15} strokeWidth={1.9} aria-hidden="true" /></span>
      <span className="pwp-row-copy">
        <span className="pwp-row-title">{title}</span>
        {subtitle && <span className="pwp-row-subtitle">{subtitle}</span>}
      </span>
      {comingSoon ? <span className="pwp-coming">COMING SOON</span> : <ChevronRight className="pwp-row-chevron" size={16} aria-hidden="true" />}
    </button>
  );
}

export function Profile() {
  return (
    <main className="pwp">
      <div className="pwp-screen">
        <StatusBar />
        <BrandHeader />
        <div className="pwp-content">
          <div className="pwp-heading">
            <div>
              <p className="pwp-eyebrow">YOUR PINT WARS</p>
              <h1 className="pwp-title">Profile</h1>
            </div>
            <span className="pwp-member-mark"><ShieldCheck size={11} /> MEMBER</span>
          </div>

          <section className="pwp-profile-card" aria-label="Steven Costa's profile">
            <div className="pwp-avatar-wrap">
              <img
                className="pwp-avatar"
                src="/__mockup/images/pw-profile-sample-avatar.jpg"
                alt="Steven Costa"
              />
              <span className="pwp-avatar-seal" aria-hidden="true"><Star size={12} fill="currentColor" /></span>
            </div>
            <div className="pwp-profile-copy">
              <p className="pwp-profile-kicker">GOOD TO HAVE YOU HERE</p>
              <h2 className="pwp-name">Steven Costa</h2>
              <p className="pwp-handle">@stevencosta</p>
              <p className="pwp-email">steven.costa@example.com</p>
            </div>
          </section>

          <section className="pwp-stats" aria-label="Pint Wars summary">
            <div className="pwp-stat">
              <strong className="pwp-stat-number">3</strong>
              <span className="pwp-stat-label">Wars played</span>
            </div>
            <div className="pwp-stat">
              <strong className="pwp-stat-number">48</strong>
              <span className="pwp-stat-label">Pints logged</span>
            </div>
            <div className="pwp-stat">
              <strong className="pwp-stat-number">12</strong>
              <span className="pwp-stat-label">Pubs visited</span>
            </div>
          </section>

          <section aria-labelledby="pwp-personal-heading">
            <h3 className="pwp-section-label" id="pwp-personal-heading">
              <span>YOUR CORNER</span><span>THE DETAILS</span>
            </h3>
            <div className="pwp-row-group">
              <ProfileRow icon={Pencil} title="Edit Profile" subtitle="Your name and account details" />
              <ProfileRow icon={Flag} title="Pint War History" subtitle="A look back at your past wars" />
              <ProfileRow icon={Star} title="Achievements" subtitle="A little recognition for the road" comingSoon />
            </div>
          </section>

          <section aria-labelledby="pwp-help-heading">
            <h3 className="pwp-section-label" id="pwp-help-heading">
              <span>HERE TO HELP</span><span>SUPPORT</span>
            </h3>
            <div className="pwp-row-group">
              <ProfileRow icon={ShieldCheck} title="Privacy Policy" tone="quiet" />
              <ProfileRow icon={CircleHelp} title="Support" tone="quiet" />
              <ProfileRow icon={MapPin} title="Account Deletion" tone="danger" />
            </div>
          </section>
          <p className="pwp-footnote">A good local is always worth coming back to.</p>
        </div>
        <BottomNav />
        <div className="pwp-home-indicator" aria-hidden="true" />
      </div>
    </main>
  );
}
