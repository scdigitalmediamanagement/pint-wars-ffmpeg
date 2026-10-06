import React, { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, BatteryFull, Beer, BookOpen, Check, ChevronRight,
  Clock3, Copy, Crown, Flag, House, Map, MapPin, Plus, Signal, TrendingUp,
  UserRound, UsersRound, Wifi, X,
} from "lucide-react";
import "./pint-wars.css";

type LeagueStatus = "active" | "completed";
type Member = { initials: string; name: string; score: number; you?: boolean };
type League = {
  id: string;
  name: string;
  status: LeagueStatus;
  elapsed: number;
  duration: number;
  players: number;
  avatars: string[];
  score?: number;
  position?: string;
  photo: string;
  photoAlt: string;
  finish?: string;
  board: Member[];
};

const INITIAL_LEAGUES: League[] = [
  {
    id: "devon-crew",
    name: "Devon Crew",
    status: "active",
    elapsed: 4,
    duration: 7,
    players: 6,
    avatars: ["TM", "JK", "YOU", "RY", "MK", "SM"],
    score: 7,
    position: "3rd",
    photo: "/__mockup/images/pw-wars-devon-active.jpg",
    photoAlt: "Friends raise their pints in a warmly lit Devon pub.",
    board: [
      { initials: "TM", name: "Tom", score: 14 },
      { initials: "JK", name: "Jack", score: 10 },
      { initials: "YOU", name: "You", score: 7, you: true },
      { initials: "RY", name: "Ryan", score: 6 },
      { initials: "MK", name: "Mike", score: 5 },
      { initials: "SM", name: "Sam", score: 3 },
    ],
  },
  {
    id: "hamburg-trip",
    name: "Hamburg Trip",
    status: "active",
    elapsed: 2,
    duration: 5,
    players: 8,
    avatars: ["EW", "LF", "FM", "SK"],
    score: 4,
    position: "4th",
    photo: "/__mockup/images/pw-wars-hamburg-trip.jpg",
    photoAlt: "Golden German lagers overlook Hamburg's harbour at blue hour.",
    board: [
      { initials: "EW", name: "Erik Wagner", score: 6 },
      { initials: "LF", name: "Lena Fischer", score: 5 },
      { initials: "YOU", name: "You", score: 4, you: true },
      { initials: "FM", name: "Felix Meyer", score: 3 },
    ],
  },
  {
    id: "summer-challenge",
    name: "Summer Challenge",
    status: "completed",
    elapsed: 14,
    duration: 14,
    players: 6,
    avatars: ["SH", "YOU", "MD", "AL"],
    position: "2nd",
    photo: "/__mockup/images/pw-wars-summer-complete.jpg",
    photoAlt: "Last light falls over a South Devon harbour and a summer pub garden.",
    finish: "You finished 2nd",
    board: [
      { initials: "SH", name: "Sam Hsu", score: 18 },
      { initials: "YOU", name: "You", score: 16, you: true },
      { initials: "MD", name: "Maria Doyle", score: 15 },
      { initials: "AL", name: "Alex Lewis", score: 13 },
    ],
  },
];

const NAV_ITEMS = [
  { name: "Home", Icon: House },
  { name: "Wars", Icon: Flag },
  { name: "Map", Icon: Map },
  { name: "Passport", Icon: BookOpen },
  { name: "Profile", Icon: UserRound },
];
const SAMPLE_INVITE_CODE = "DEVON-47";

function rankLabel(rank: number) {
  return `${rank}${rank === 1 ? "st" : rank === 2 ? "nd" : rank === 3 ? "rd" : "th"}`;
}

function inviteCodeFor(league: League) {
  if (league.id === "devon-crew") return SAMPLE_INVITE_CODE;
  return `${league.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-$/, "")}-21`;
}

type Tab = LeagueStatus;

function StatusBar() {
  return (
    <div className="pww-status" aria-label="9:41, full cellular signal, Wi-Fi and battery">
      <span>9:41</span>
      <span className="pww-status-right" aria-hidden="true">
        <Signal size={13} strokeWidth={2.4} />
        <Wifi size={13} strokeWidth={2.3} />
        <BatteryFull size={16} strokeWidth={2.2} />
      </span>
    </div>
  );
}

function WarAvatars({ league }: { league: League }) {
  const additionalPlayers = league.players - Math.min(league.avatars.length, 3);
  const avatars = league.avatars.slice(0, 3);
  return (
    <div className="pww-roster" aria-label={`${league.players} players`}>
      <span className="pww-avatar-group" aria-hidden="true">
        {avatars.map((initials, index) => (
          <span className="pww-avatar" key={`${league.id}-${initials}-${index}`}>{initials}</span>
        ))}
        {additionalPlayers > 0 && (
          <span className="pww-avatar pww-avatar-more">+{additionalPlayers}</span>
        )}
      </span>
      <span className="pww-roster-label">
        {league.players === 1 ? "Just you so far" : `You & ${league.players - 1} others`}
      </span>
    </div>
  );
}

function WarCard({
  league,
  compact = false,
  onOpen,
}: {
  league: League;
  compact?: boolean;
  onOpen: (league: League) => void;
}) {
  const completed = league.status === "completed";
  const className = [
    "pww-war-card",
    compact ? "pww-war-card--compact" : "",
    completed ? "pww-war-card--completed" : "",
  ].filter(Boolean).join(" ");
  const playerLabel = `${league.players} ${league.players === 1 ? "player" : "players"}`;
  const accessibleSummary = `${league.name}. ${completed ? "Completed" : "Live"}. Day ${league.elapsed} of ${league.duration}. ${playerLabel}. Open Pint War.`;

  return (
    <button
      className={className}
      type="button"
      onClick={() => onOpen(league)}
      aria-label={accessibleSummary}
    >
      <img className="pww-war-photo" src={league.photo} alt="" />
      <span className="pww-war-shade" />
      <span className="pww-war-content">
        <span className="pww-war-topline">
          {completed ? (
            <span className="pww-completed-badge"><Check size={10} strokeWidth={3} /> COMPLETED</span>
          ) : (
            <><span className="pww-live-dot" /> LIVE PINT WAR</>
          )}
        </span>
        <span className="pww-war-title">{league.name}</span>
        <span className="pww-war-meta">
          <span>Day {league.elapsed} of {league.duration}</span>
          <span className="pww-meta-divider" />
          <span>{playerLabel}</span>
        </span>
        {!completed && <WarAvatars league={league} />}
        {completed ? (
          <span className="pww-war-meta">{league.finish}</span>
        ) : (
          <span className="pww-war-footer">
            <span className="pww-war-rank">Your position <strong>{league.position}</strong></span>
            <span className="pww-war-score">{league.score} pts</span>
          </span>
        )}
      </span>
      <span className="pww-chevron" aria-hidden="true"><ChevronRight size={15} strokeWidth={2.1} /></span>
    </button>
  );
}

function EmptyState({ tab, onCreate }: { tab: Tab; onCreate: () => void }) {
  const completed = tab === "completed";
  return (
    <div className="pww-empty" role="status">
      <div>
        <span className="pww-empty-icon" aria-hidden="true">
          {completed ? <Check size={17} /> : <Flag size={16} />}
        </span>
        <strong>{completed ? "Nothing archived just yet" : "No active Pint Wars"}</strong>
        <p>
          {completed
            ? "Once a war wraps up, you’ll find it here."
            : "Get the crew together and make your next visit count."}
        </p>
        {!completed && (
          <button className="pww-button pww-button--primary pww-empty-cta" type="button" onClick={onCreate}>
            <Plus size={15} /> Create a Pint War
          </button>
        )}
      </div>
    </div>
  );
}

function CreateWarDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, duration: number, capacity: number) => void;
}) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("7");
  const [capacity, setCapacity] = useState("6");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Add a name of at least 2 characters to get your war started.");
      inputRef.current?.focus();
      return;
    }
    onCreate(cleanName, Number(duration), Number(capacity));
  }

  return (
    <div
      className="pww-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section className="pww-dialog" role="dialog" aria-modal="true" aria-labelledby="pww-dialog-title">
        <div className="pww-dialog-top">
          <div>
            <p className="pww-dialog-eyebrow">GATHER YOUR CREW</p>
            <h2 className="pww-dialog-title" id="pww-dialog-title">Create a Pint War</h2>
          </div>
          <button className="pww-icon-button" type="button" aria-label="Close create Pint War" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <p className="pww-form-intro">Name the challenge. You can invite your players after.</p>
        <form onSubmit={submit}>
          <label className="pww-field">
            <span>War name</span>
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. Friday Night Crew"
              maxLength={30}
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "pww-form-error" : undefined}
            />
          </label>
          <div className="pww-field-pair">
            <label className="pww-field">
              <span>War length</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="7">7 days</option>
                <option value="10">10 days</option>
                <option value="14">14 days</option>
              </select>
            </label>
            <label className="pww-field">
              <span>Player limit</span>
              <select value={capacity} onChange={(event) => setCapacity(event.target.value)}>
                <option value="4">4 players</option>
                <option value="6">6 players</option>
                <option value="8">8 players</option>
                <option value="10">10 players</option>
                <option value="12">12 players</option>
              </select>
            </label>
          </div>
          {error && <p className="pww-form-error" id="pww-form-error" role="alert">{error}</p>}
          <p className="pww-demo-note">Design preview only — a sample card is added here on this screen. Nothing is saved or sent.</p>
          <div className="pww-form-actions">
            <button className="pww-button pww-button--secondary" type="button" onClick={onClose}>Not now</button>
            <button className="pww-button pww-button--primary" type="submit">
              Create preview <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type ActivityItem = {
  id: string;
  name: string;
  initials: string;
  action: string;
  time: string;
  venue?: string;
  kind: "pint" | "position";
};

const DEVON_ACTIVITY: ActivityItem[] = [
  { id: "tom-pint", name: "Tom", initials: "TM", action: "logged a pint", time: "4m ago", venue: "The Duke of York", kind: "pint" },
  { id: "jack-place", name: "Jack", initials: "JK", action: "moved into 2nd", time: "21m ago", kind: "position" },
  { id: "mike-crown", name: "Mike", initials: "MK", action: "logged a pint", time: "41m ago", venue: "The Crown", kind: "pint" },
];

function ActivityFeed({ activity, compact = false }: { activity: ActivityItem[]; compact?: boolean }) {
  const items = compact ? activity.slice(0, 3) : activity;
  return (
    <div className={`pww-activity-list${compact ? " pww-activity-list--compact" : ""}`} role="list" aria-label="Recent live Pint War activity">
      {items.map((item) => (
        <article className="pww-activity-row" role="listitem" key={item.id}>
          <span className={`pww-activity-avatar pww-activity-avatar--${item.kind}`} aria-hidden="true">
            {item.initials}
            <span className="pww-activity-avatar-mark">
              {item.kind === "position" ? <TrendingUp size={10} /> : <Beer size={9} />}
            </span>
          </span>
          <span className="pww-activity-copy">
            <span className="pww-activity-line"><strong>{item.name}</strong> {item.action}</span>
            {item.venue && <span className="pww-activity-venue"><MapPin size={9} /> {item.venue}</span>}
          </span>
          <time className="pww-activity-time">{item.time}</time>
        </article>
      ))}
    </div>
  );
}

function WarDetail({
  league,
  onBack,
  onLogPint,
  onInvite,
}: {
  league: League;
  onBack: () => void;
  onLogPint: () => void;
  onInvite: () => void;
}) {
  const [section, setSection] = useState<"leaderboard" | "activity" | "details">("leaderboard");
  const [members, setMembers] = useState(() => league.board);
  const [activity, setActivity] = useState< ActivityItem[]>(() => DEVON_ACTIVITY);
  const finished = league.status === "completed";
  if (finished) {
    return (
      <section className="pww-detail" aria-label={`${league.name} Pint War details`}>
        <button className="pww-back" type="button" onClick={onBack}>
          <ArrowLeft size={15} /> All Pint Wars
        </button>
        <div className="pww-detail-hero">
          <img className="pww-detail-photo" src={league.photo} alt="" />
          <div className="pww-detail-shade" />
          <div className="pww-detail-hero-content">
            <span className="pww-war-topline"><span className="pww-completed-badge"><Check size={10} /> COMPLETED WAR</span></span>
            <h2 className="pww-war-title">{league.name}</h2>
            <span className="pww-war-meta">
              Day {league.elapsed} of {league.duration}
              <span className="pww-meta-divider" />
              {league.players} players
            </span>
          </div>
        </div>
        <section className="pww-detail-panel" aria-labelledby="pww-standings">
          <div className="pww-detail-panel-heading">
            <span id="pww-standings">Final standings</span><span>Final</span>
          </div>
          {league.board.map((member, index) => (
            <div className="pww-player" key={`${league.id}-${member.initials}`}>
              <span className="pww-player-rank">{index + 1}</span>
              <span className="pww-avatar" aria-hidden="true">{member.initials}</span>
              <span className="pww-player-name">{member.name}</span>
              <span className="pww-player-score">{member.score} pts</span>
            </div>
          ))}
        </section>
        <p className="pww-detail-note">Your crew logged {league.players} players over {league.duration} days.</p>
      </section>
    );
  }

  const sortedMembers = [...members].sort((a, b) => b.score - a.score);
  const userRank = 1 + members.filter((member) => member.score > (members.find((player) => player.you)?.score ?? 0)).length;
  const daysRemaining = Math.max(0, league.duration - league.elapsed);

  function logPint() {
    const nextMembers = members.map((member) => member.you ? { ...member, score: member.score + 1 } : member);
    setMembers(nextMembers);
    setActivity((items) => [{
      id: `you-pint-${Date.now()}`,
      name: "You",
      initials: "YOU",
      action: "logged a pint",
      time: "just now",
      venue: "The Crown",
      kind: "pint",
    }, ...items]);
    onLogPint();
  }

  return (
    <section className="pww-detail pww-live-detail" aria-label={`${league.name} live Pint War`}>
      <button className="pww-back" type="button" onClick={onBack}>
        <ArrowLeft size={15} /> ALL PINT WARS
      </button>
      <div className="pww-detail-hero pww-live-hero">
        <img className="pww-detail-photo" src={league.photo} alt="" />
        <div className="pww-detail-shade" />
        <div className="pww-detail-hero-content pww-live-hero-content">
          <div className="pww-live-topline">
            <span className="pww-war-topline"><span className="pww-live-dot" /> LIVE PINT WAR</span>
            <span className="pww-live-countdown"><Clock3 size={11} /> {daysRemaining} DAYS LEFT</span>
          </div>
          <h2 className="pww-war-title">{league.name}</h2>
          <div className="pww-live-hero-meta">
            <span>DAY {league.elapsed} OF {league.duration}</span><i />
            <span><UsersRound size={11} /> {league.players} PLAYERS</span>
            <span className="pww-live-place"><Crown size={11} /> YOU&apos;RE {rankLabel(userRank).toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div className="pww-live-tabs" role="tablist" aria-label={`${league.name} live war`}>
        {([
          ["leaderboard", "Leaderboard"],
          ["activity", "Activity"],
          ["details", "Details"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={`pww-live-tab${section === value ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={section === value}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "leaderboard" && (
        <>
          <section className="pww-live-section" aria-labelledby="pww-live-leaderboard">
            <div className="pww-live-section-heading">
              <span><span className="pww-live-eyebrow">THE RACE SO FAR</span><strong id="pww-live-leaderboard">Leaderboard</strong></span>
              <span className="pww-live-now"><span className="pww-live-dot" /> LIVE</span>
            </div>
            <div className="pww-live-board" role="list" aria-label="Six-player live leaderboard">
              <div className="pww-live-board-head" aria-hidden="true">
                <span>POS</span><span>PLAYER</span><span>POINTS</span>
              </div>
              {sortedMembers.map((member, index) => {
                const position = 1 + sortedMembers.filter((other) => other.score > member.score).length;
                return (
                  <div
                    className={`pww-live-row${member.you ? " pww-live-row--you" : ""}`}
                    role="listitem"
                    aria-label={`${position}${position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th"}, ${member.name}, ${member.score} points${member.you ? ", your position" : ""}`}
                    key={`${member.initials}-${member.name}`}
                  >
                    <span className={`pww-live-rank${member.you ? " pww-live-rank--you" : ""}`}>
                      {String(position).padStart(2, "0")}
                    </span>
                    <span className={`pww-live-player-avatar pww-live-player-avatar--${member.initials.toLowerCase()}`} aria-hidden="true">{member.initials}</span>
                    <span className="pww-live-player-name">{member.name}{member.you && <span className="pww-you-tag">YOU</span>}</span>
                    <span className="pww-live-player-score">{member.score}<span> pts</span></span>
                  </div>
                );
              })}
            </div>
          </section>
          <button className="pww-log-button" type="button" onClick={logPint} aria-label="Log a pint for your Devon Crew score">
            <span className="pww-log-icon"><Beer size={19} /></span>
            <span className="pww-log-copy"><strong>LOG A PINT</strong><small>Add today&apos;s visit to your score</small></span>
            <ArrowRight size={19} className="pww-log-arrow" />
          </button>
          <section className="pww-live-activity" aria-labelledby="pww-live-recent-heading">
            <div className="pww-live-activity-heading">
              <h3 id="pww-live-recent-heading">RECENT ACTIVITY</h3><span><span className="pww-live-dot" /> LIVE</span>
            </div>
            <ActivityFeed activity={activity} compact />
          </section>
        </>
      )}

      {section === "activity" && (
        <section className="pww-live-panel pww-live-section" aria-labelledby="pww-all-activity-heading">
          <div className="pww-live-section-heading">
            <span><span className="pww-live-eyebrow">THE CREW IS MOVING</span><strong id="pww-all-activity-heading">Recent activity</strong></span>
            <span className="pww-live-now"><span className="pww-live-dot" /> LIVE</span>
          </div>
          <ActivityFeed activity={activity} />
          <button className="pww-log-button pww-log-button--inline" type="button" onClick={logPint}>
            <Beer size={17} /><span>LOG A PINT</span><ArrowRight size={16} className="pww-log-arrow" />
          </button>
        </section>
      )}

      {section === "details" && (
        <section className="pww-live-panel pww-live-details" aria-labelledby="pww-race-details">
          <div className="pww-live-section-heading">
            <span><span className="pww-live-eyebrow">DEVON CREW</span><strong id="pww-race-details">Race details</strong></span>
            <span className="pww-live-now"><span className="pww-live-dot" /> IN PROGRESS</span>
          </div>
          <div className="pww-live-facts">
            <div className="pww-live-fact"><Clock3 size={16} /><span><strong>Day {league.elapsed} of {league.duration}</strong><small>{daysRemaining} days remaining</small></span></div>
            <div className="pww-live-fact"><UsersRound size={16} /><span><strong>{league.players} players</strong><small>Just your Devon crew</small></span></div>
            <div className="pww-live-fact"><MapPin size={16} /><span><strong>South Devon</strong><small>Local pub visits, logged by the crew</small></span></div>
          </div>
          <div className="pww-live-progress-copy"><span>THE WEEK SO FAR</span><span>{league.elapsed} of {league.duration} days</span></div>
          <div className="pww-live-progress" role="img" aria-label={`War is on day ${league.elapsed} of ${league.duration}`}><span style={{ width: `${Math.min(100, (league.elapsed / league.duration) * 100)}%` }} /></div>
          <p className="pww-live-rule">The crew that logs the most pints takes the crown. {daysRemaining} days remain to climb the table.</p>
          <button className="pww-invite-control" type="button" onClick={onInvite}><UsersRound size={16} /><span>Invite your crew</span><Copy size={14} /></button>
        </section>
      )}
    </section>
  );
}

export function Wars() {
  const [leagues, setLeagues] = useState(INITIAL_LEAGUES);
  const [tab, setTab] = useState<Tab>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(
    () => INITIAL_LEAGUES.find((league) => league.id === "devon-crew") ?? null,
  );
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!createOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createOpen]);

  const activeLeagues = leagues.filter((league) => league.status === "active");
  const completedLeagues = leagues.filter((league) => league.status === "completed");
  const visibleLeagues = tab === "active" ? activeLeagues : completedLeagues;

  function addPreviewWar(name: string, duration: number, capacity: number) {
    const preview: League = {
      id: `preview-${Date.now()}`,
      name,
      status: "active",
      elapsed: 1,
      duration,
      players: 1,
      avatars: ["YOU"],
      score: 0,
      position: "—",
      photo: "/__mockup/images/pw-wars-devon-active.jpg",
      photoAlt: "Pint War preview artwork from a warmly lit Devon pub.",
      board: [{ initials: "YOU", name: "You", score: 0, you: true }],
    };
    setLeagues((current) => [...current, preview]);
    setTab("active");
    setCreateOpen(false);
    setToast(`${name} added to this preview · ${capacity} player spots`);
  }

  function notifyNav(section: string) {
    if (section !== "Wars") setToast(`${section} screen · visual preview only`);
  }

  return (
    <main className="pww">
      <div className="pww-screen">
        <StatusBar />
        <header className="pww-header">
          <div className="pww-brand" aria-label="Pint Wars">
            <img className="pww-crest" src="/__mockup/images/pw-wars-crest.png" alt="" />
            <img className="pww-wordmark" src="/__mockup/images/pw-wars-wordmark.png" alt="Pint Wars" />
          </div>
          {selectedLeague?.status === "active" ? (
            <button className="pww-create pww-invite-header" type="button"
              aria-label={`Copy ${selectedLeague.name} invite code`} title={`Copy ${selectedLeague.name} invite code`}
              onClick={() => {
                const inviteCode = inviteCodeFor(selectedLeague);
                if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(inviteCode)
                    .then(() => setToast(`Invite code ${inviteCode} copied.`))
                    .catch(() => setToast(`Invite code: ${inviteCode}`));
                } else setToast(`Invite code: ${inviteCode}`);
              }}>
              <UsersRound size={15} strokeWidth={2} /><span>Invite</span>
            </button>
          ) : (
            <button className="pww-create" type="button" aria-label="Create a Pint War"
              title="Create a Pint War" onClick={() => setCreateOpen(true)}>
              <Plus size={17} strokeWidth={2.1} /><span>Create</span>
            </button>
          )}
        </header>

        <div className="pww-content">
          {!selectedLeague ? (
            <>
              <div className="pww-title-row">
                <div>
                  <span className="pww-eyebrow">YOUR LEAGUES</span>
                  <h1 className="pww-page-title">The rivalry is on.</h1>
                </div>
              </div>

              <div className="pww-tabs" role="tablist" aria-label="Pint Wars by status">
                <button
                  id="pww-tab-active"
                  className={`pww-tab${tab === "active" ? " is-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === "active"}
                  aria-controls="pww-war-list"
                  onClick={() => setTab("active")}
                >
                  ACTIVE <span className="pww-count">{activeLeagues.length}</span>
                </button>
                <button
                  id="pww-tab-completed"
                  className={`pww-tab${tab === "completed" ? " is-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === "completed"}
                  aria-controls="pww-war-list"
                  onClick={() => setTab("completed")}
                >
                  COMPLETED <span className="pww-count">{completedLeagues.length}</span>
                </button>
              </div>

              <section
                className="pww-list"
                id="pww-war-list"
                role="tabpanel"
                aria-labelledby={`pww-tab-${tab}`}
              >
                <h2 className="pww-section-title">
                  {tab === "active" ? "ACTIVE WARS" : "THE FINAL WHISTLE"}
                  <span className="pww-section-title-side">
                    {visibleLeagues.length} {visibleLeagues.length === 1 ? "war" : "wars"}
                  </span>
                </h2>
                {visibleLeagues.length ? (
                  <div className="pww-war-stack">
                    {visibleLeagues.map((league, index) => (
                      <WarCard
                        key={league.id}
                        league={league}
                        compact={tab === "active" && index > 0}
                        onOpen={setSelectedLeague}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState tab={tab} onCreate={() => setCreateOpen(true)} />
                )}
                {tab === "active" && completedLeagues.length > 0 && (
                  <section className="pww-list pww-list--completed" aria-labelledby="pww-completed-preview">
                    <h2 className="pww-section-title" id="pww-completed-preview">
                      RECENTLY COMPLETED <span className="pww-section-title-side">IN THE ARCHIVE</span>
                    </h2>
                    <div className="pww-war-stack">
                      {completedLeagues.slice(0, 1).map((league) => (
                        <WarCard key={league.id} league={league} onOpen={setSelectedLeague} />
                      ))}
                    </div>
                  </section>
                )}
                {tab === "active" && activeLeagues.length === 0 && completedLeagues.length > 0 && (
                  <section className="pww-list pww-list--completed" aria-labelledby="pww-past-wars">
                    <h2 className="pww-section-title" id="pww-past-wars">
                      RECENTLY COMPLETED <span className="pww-section-title-side">IN THE ARCHIVE</span>
                    </h2>
                    <div className="pww-war-stack">
                      {completedLeagues.slice(0, 1).map((league) => (
                        <WarCard key={league.id} league={league} onOpen={setSelectedLeague} />
                      ))}
                    </div>
                  </section>
                )}
              </section>
            </>
          ) : (
            <WarDetail
              key={selectedLeague.id}
              league={selectedLeague}
              onBack={() => setSelectedLeague(null)}
              onInvite={() => setToast(`Invite code: ${inviteCodeFor(selectedLeague)}`)}
              onLogPint={() => {
                setLeagues((current) => current.map((item) => {
                  if (item.id !== selectedLeague.id) return item;
                  const board = item.board.map((member) => member.you ? { ...member, score: member.score + 1 } : member);
                  const myScore = board.find((member) => member.you)?.score ?? 0;
                  const myRank = 1 + board.filter((member) => member.score > myScore).length;
                  return {
                    ...item,
                    board,
                    score: myScore,
                    position: rankLabel(myRank),
                  };
                }));
                setToast("Pint added to your demo score.");
              }}
            />
          )}
        </div>

        <nav className="pww-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ name, Icon }) => (
            <button
              key={name}
              className={`pww-nav-item${name === "Wars" ? " is-current" : ""}`}
              type="button"
              aria-current={name === "Wars" ? "page" : undefined}
              onClick={() => notifyNav(name)}
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="pww-home-indicator" aria-hidden="true" />

        {toast && <div className="pww-toast" role="status">{toast}</div>}
        {createOpen && (
          <CreateWarDialog onClose={() => setCreateOpen(false)} onCreate={addPreviewWar} />
        )}
      </div>
    </main>
  );
}
