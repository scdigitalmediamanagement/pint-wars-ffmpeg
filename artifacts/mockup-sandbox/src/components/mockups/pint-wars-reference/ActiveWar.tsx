import React, { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, BatteryFull, BookOpen, Check,
  ChevronRight, Clock3, Copy, Flag, House, Map, MapPin, Signal,
  UserRound, UsersRound, Wifi, X,
} from "lucide-react";
import "./active-war.css";

type Player = { id: string; name: string; initials: string; score: number };
type Activity = { id: number; name: string; initials: string; place: string; time: string };
type ViewTab = "board" | "activity" | "details";

const INITIAL_PLAYERS: Player[] = [
  { id: "tom", name: "Tom", initials: "TM", score: 14 },
  { id: "jack", name: "Jack", initials: "JK", score: 10 },
  { id: "you", name: "You", initials: "YOU", score: 7 },
  { id: "ryan", name: "Ryan", initials: "RY", score: 6 },
  { id: "mike", name: "Mike", initials: "MK", score: 5 },
  { id: "sam", name: "Sam", initials: "SM", score: 3 },
];

const INITIAL_ACTIVITY: Activity[] = [
  { id: 3, name: "Tom", initials: "TM", place: "The Duke of York", time: "4m ago" },
  { id: 2, name: "Jack", initials: "JK", place: "The Globe Inn", time: "21m ago" },
  { id: 1, name: "Ryan", initials: "RY", place: "The Ship Inn", time: "46m ago" },
];

const NAV_ITEMS = [
  { name: "Home", Icon: House },
  { name: "Wars", Icon: Flag },
  { name: "Map", Icon: Map },
  { name: "Passport", Icon: BookOpen },
  { name: "Profile", Icon: UserRound },
];

const INVITE_CODE = "DEVON-47";
const PUBS = ["The Duke of York", "The Globe Inn", "The Ship Inn"];

function StatusBar() {
  return (
    <div className="pwa-status" aria-label="9:41, full cellular signal, Wi-Fi and battery">
      <span>9:41</span>
      <span className="pwa-status-right" aria-hidden="true">
        <Signal size={13} strokeWidth={2.4} />
        <Wifi size={13} strokeWidth={2.3} />
        <BatteryFull size={16} strokeWidth={2.2} />
      </span>
    </div>
  );
}

function BottomNav({ onPick }: { onPick: (section: string) => void }) {
  return (
    <nav className="pwa-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ name, Icon }) => (
        <button
          key={name}
          className={`pwa-nav-item${name === "Wars" ? " is-current" : ""}`}
          type="button"
          aria-current={name === "Wars" ? "page" : undefined}
          onClick={() => {
            if (name !== "Wars") onPick(`${name} screen · visual preview only`);
          }}
        >
          <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>{name}</span>
        </button>
      ))}
    </nav>
  );
}

function Leaderboard({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <section className="pwa-board" aria-labelledby="pwa-board-title">
      <div className="pwa-board-heading">
        <span id="pwa-board-title">PLAYER</span>
        <span>POINTS</span>
      </div>
      {sorted.map((player, index) => (
        <div
          className={`pwa-player${player.id === "you" ? " pwa-player-you" : ""}`}
          key={player.id}
          aria-label={`${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"}, ${player.name}, ${player.score} points${player.id === "you" ? ", your position" : ""}`}
        >
          <span className={`pwa-rank${index < 3 ? " pwa-rank-top" : ""}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className={`pwa-avatar pwa-avatar-${player.id}`} aria-hidden="true">{player.initials}</span>
          <span className="pwa-player-name">
            <span>{player.name}</span>
            {player.id === "you" && <span className="pwa-you-tag">YOU</span>}
          </span>
          <span className="pwa-player-score">
            {player.score} <span>pts</span>
          </span>
          {player.id === "you" && <span className="pwa-you-marker" aria-hidden="true" />}
        </div>
      ))}
    </section>
  );
}

function RecentActivity({ activity }: { activity: Activity[] }) {
  return (
    <section className="pwa-recent" aria-labelledby="pwa-recent-title">
      <div className="pwa-section-heading">
        <h2 id="pwa-recent-title">RECENT ACTIVITY</h2>
        <span>LIVE</span>
      </div>
      {activity.slice(0, 2).map((item) => (
        <div className="pwa-activity-row" key={item.id}>
          <span className={`pwa-avatar pwa-avatar-${item.initials.toLowerCase()}`} aria-hidden="true">
            {item.initials}
          </span>
          <span className="pwa-activity-copy">
            <span><strong>{item.name}</strong> logged a pint</span>
            <span className="pwa-activity-place"><MapPin size={10} aria-hidden="true" />{item.place}</span>
          </span>
          <time className="pwa-activity-time">{item.time}</time>
        </div>
      ))}
    </section>
  );
}

function ActivityView({ activity }: { activity: Activity[] }) {
  return (
    <section className="pwa-detail-view" aria-label="Recent war activity">
      <div className="pwa-section-heading pwa-history-heading">
        <h2>THE LATEST</h2>
        <span>DAY 4</span>
      </div>
      {activity.map((item, index) => (
        <div className="pwa-history-row" key={item.id}>
          <span className={`pwa-avatar pwa-avatar-${item.initials.toLowerCase()}`} aria-hidden="true">
            {item.initials}
          </span>
          <span className="pwa-history-copy">
            <strong>{item.name} logged a pint</strong>
            <span><MapPin size={11} aria-hidden="true" /> {item.place}</span>
          </span>
          <time>{index === 0 && item.time === "Just now" ? "NOW" : item.time}</time>
        </div>
      ))}
      <p className="pwa-demo-caption">Only the latest crew check-ins, all in one place.</p>
    </section>
  );
}

function DetailsView() {
  return (
    <section className="pwa-detail-view" aria-label="Devon Crew war details">
      <div className="pwa-section-heading pwa-history-heading">
        <h2>THE CHALLENGE</h2>
        <span>DAY 4 / 7</span>
      </div>
      <p className="pwa-details-intro">One crew. Seven days. A new reason to call in at your local.</p>
      <div className="pwa-fact"><Clock3 size={16} /><span><strong>Three days left</strong><span>The final round ends on Sunday</span></span></div>
      <div className="pwa-fact"><UsersRound size={16} /><span><strong>Six players</strong><span>Just your Devon crew</span></span></div>
      <div className="pwa-fact"><MapPin size={16} /><span><strong>South Devon</strong><span>Local pub visits, logged by the crew</span></span></div>
      <div className="pwa-rules">
        <span className="pwa-rules-eyebrow">HOUSE RULE</span>
        <p>Discover a different local to earn your place at the top.</p>
      </div>
      <div className="pwa-detail-progress-label"><span>THE WEEK SO FAR</span><span>4 of 7 days</span></div>
      <div className="pwa-progress" role="img" aria-label="War is on day 4 of 7"><span /></div>
    </section>
  );
}

function WarHero() {
  return (
    <section className="pwa-hero" aria-label="Devon Crew, live Pint War, day 4 of 7">
      <img
        className="pwa-hero-image"
        src="/__mockup/images/pw-wars-devon-active.jpg"
        alt="Friends meeting for a pint in a warm Devon pub"
      />
      <div className="pwa-hero-shade" />
      <div className="pwa-hero-top">
        <span className="pwa-live-badge"><i /> LIVE PINT WAR</span>
        <span className="pwa-days-badge">3 DAYS LEFT</span>
      </div>
      <div className="pwa-hero-copy">
        <h1>Devon Crew</h1>
        <div className="pwa-hero-meta"><span>DAY 4 OF 7</span><i /> <span>6 PLAYERS</span></div>
      </div>
      <span className="pwa-hero-index" aria-hidden="true">01 <i /> 01</span>
    </section>
  );
}

function InviteDialog({ onClose, onNotify }: { onClose: () => void; onNotify: (message: string) => void }) {
  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(INVITE_CODE);
        onNotify("Invite code copied.");
        return;
      }
    } catch {
      // Clipboard access can be unavailable in a mock-up preview; the code stays visible for manual copying.
    }
    onNotify(`Your invite code is ${INVITE_CODE}.`);
  }

  return (
    <div className="pwa-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-invite-title">
        <div className="pwa-sheet-grip" />
        <div className="pwa-sheet-heading">
          <span className="pwa-sheet-kicker">THE MORE, THE MERRIER</span>
          <button type="button" className="pwa-close" aria-label="Close invite" onClick={onClose}><X size={17} /></button>
          <h2 id="pwa-invite-title">Bring the crew along.</h2>
          <p>Share a code and they can join Devon Crew.</p>
        </div>
        <div className="pwa-invite-code">
          <span>YOUR INVITE CODE</span>
          <strong>{INVITE_CODE}</strong>
          <button type="button" onClick={() => { void copyCode(); }} aria-label="Copy invite code">
            <Copy size={15} /> Copy
          </button>
        </div>
        <p className="pwa-demo-caption">Illustrative invite code · preview only</p>
        <button className="pwa-secondary-action" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}

function LogPintDialog({
  selectedPub,
  onSelectPub,
  onClose,
  onConfirm,
}: {
  selectedPub: string;
  onSelectPub: (pub: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="pwa-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-log-title">
        <div className="pwa-sheet-grip" />
        <div className="pwa-sheet-heading">
          <span className="pwa-sheet-kicker">A LITTLE SOMETHING FOR THE BOARD</span>
          <button type="button" className="pwa-close" aria-label="Close pint logging" onClick={onClose}><X size={17} /></button>
          <h2 id="pwa-log-title">Log a pint.</h2>
          <p>Choose a Devon local to add to your demo score.</p>
        </div>
        <div className="pwa-pub-options" role="group" aria-label="Choose a sample pub">
          {PUBS.map((pub) => (
            <button
              className={`pwa-pub-option${selectedPub === pub ? " is-selected" : ""}`}
              key={pub}
              type="button"
              aria-pressed={selectedPub === pub}
              onClick={() => onSelectPub(pub)}
            >
              <MapPin size={15} /><span>{pub}</span>{selectedPub === pub && <Check size={15} />}
            </button>
          ))}
        </div>
        <p className="pwa-demo-caption">Sample activity only. Nothing is sent or saved.</p>
        <button className="pwa-confirm-pint" type="button" onClick={onConfirm}>
          Add to the leaderboard <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}

export default function ActiveWar() {
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [activity, setActivity] = useState(INITIAL_ACTIVITY);
  const [view, setView] = useState<ViewTab>("board");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [selectedPub, setSelectedPub] = useState(PUBS[0]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!inviteOpen && !logOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInviteOpen(false);
        setLogOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [inviteOpen, logOpen]);

  function logPreviewPint() {
    setPlayers((current) => current.map((player) =>
      player.id === "you" ? { ...player, score: player.score + 1 } : player,
    ));
    setActivity((current) => [
      { id: Date.now(), name: "You", initials: "YOU", place: selectedPub, time: "Just now" },
      ...current,
    ]);
    setLogOpen(false);
    setView("board");
    setToast("Pint added to your demo score.");
  }

  return (
    <main className="pwa">
      <div className="pwa-screen">
        <StatusBar />
        <header className="pwa-header">
          <a className="pwa-brand" href="/__mockup/preview/pint-wars-reference/Wars" aria-label="Back to Pint Wars">
            <img className="pwa-crest" src="/__mockup/images/pw-reference-crest.png" alt="" />
            <img className="pwa-wordmark" src="/__mockup/images/pw-reference-wordmark.png" alt="Pint Wars" />
          </a>
          <button className="pwa-invite-button" type="button" onClick={() => setInviteOpen(true)}>
            <UsersRound size={14} /> <span>Invite</span>
          </button>
        </header>

        <div className="pwa-content">
          <a className="pwa-back" href="/__mockup/preview/pint-wars-reference/Wars">
            <ArrowLeft size={13} /> <span>ALL PINT WARS</span>
          </a>

          <WarHero />

          <div className="pwa-tabs" role="tablist" aria-label="Devon Crew information">
            <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-active" : ""} onClick={() => setView("board")}>
              Leaderboard
            </button>
            <button type="button" role="tab" aria-selected={view === "activity"} className={view === "activity" ? "is-active" : ""} onClick={() => setView("activity")}>
              Activity
              {activity.some((item) => item.name === "You") && <span className="pwa-unread-dot" aria-label="New activity" />}
            </button>
            <button type="button" role="tab" aria-selected={view === "details"} className={view === "details" ? "is-active" : ""} onClick={() => setView("details")}>
              Details
            </button>
          </div>

          {view === "board" && (
            <>
              <div className="pwa-rank-headline">
                <div><span className="pwa-section-kicker">THE RACE SO FAR</span><h2>Leaderboard</h2></div>
                <span className="pwa-standing-pill"><span className="pwa-standing-dot" /> LIVE</span>
              </div>
              <Leaderboard players={players} />
              <button className="pwa-log-button" type="button" onClick={() => setLogOpen(true)}>
                <span className="pwa-log-icon"><Flag size={16} strokeWidth={2} /></span>
                <span>Log a Pint</span>
                <ArrowRight size={17} />
              </button>
              <RecentActivity activity={activity} />
            </>
          )}
          {view === "activity" && (
            <>
              <div className="pwa-rank-headline">
                <div><span className="pwa-section-kicker">SOUTH DEVON · DAY 4</span><h2>Recent activity</h2></div>
                <span className="pwa-standing-pill"><span className="pwa-standing-dot" /> LIVE</span>
              </div>
              <ActivityView activity={activity} />
              <button className="pwa-log-button" type="button" onClick={() => setLogOpen(true)}>
                <span className="pwa-log-icon"><Flag size={16} strokeWidth={2} /></span>
                <span>Log a Pint</span>
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {view === "details" && (
            <>
              <div className="pwa-rank-headline">
                <div><span className="pwa-section-kicker">DEVON CREW · SOUTH DEVON</span><h2>War details</h2></div>
                <span className="pwa-standing-pill"><UsersRound size={12} /> 6 PLAYERS</span>
              </div>
              <DetailsView />
              <button className="pwa-log-button" type="button" onClick={() => setInviteOpen(true)}>
                <span className="pwa-log-icon"><UsersRound size={16} strokeWidth={2} /></span>
                <span>Invite your crew</span>
                <ChevronRight size={17} />
              </button>
            </>
          )}
        </div>

        <BottomNav onPick={setToast} />
        <div className="pwa-home-indicator" aria-hidden="true" />
        {toast && <div className="pwa-toast" role="status">{toast}</div>}
        {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} onNotify={setToast} />}
        {logOpen && (
          <LogPintDialog
            selectedPub={selectedPub}
            onSelectPub={setSelectedPub}
            onClose={() => setLogOpen(false)}
            onConfirm={logPreviewPint}
          />
        )}
      </div>
    </main>
  );
}
