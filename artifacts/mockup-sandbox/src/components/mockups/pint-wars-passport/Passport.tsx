import React, { useEffect, useState } from "react";
import {
  ArrowRight, BatteryFull, BookOpen, CalendarDays, ChevronRight,
  Flag, House, Map, MapPin, MessageCircle, Signal, Star, UserRound, Wifi, X,
} from "lucide-react";
import "./passport.css";

type Pub = {
  name: string;
  area: string;
  image: string;
  visits: number;
  pints: number;
  recent: string;
  review: "Reviewed" | "Review due";
  rating?: string;
  quote?: string;
};

const PUBS: Pub[] = [
  {
    name: "The Crown",
    area: "TOTNES · 0.3 MI",
    image: "/__mockup/images/passport-crown.jpg",
    visits: 4,
    pints: 9,
    recent: "2 days ago",
    review: "Reviewed",
    rating: "4.8",
    quote: "A proper cosy local.",
  },
  {
    name: "The Harbour Arms",
    area: "DARTMOUTH · 1.2 MI",
    image: "/__mockup/images/passport-harbour-arms.jpg",
    visits: 6,
    pints: 11,
    recent: "Sunday",
    review: "Review due",
  },
  {
    name: "The Old Anchor",
    area: "BRIXHAM · 3.4 MI",
    image: "/__mockup/images/passport-old-anchor.jpg",
    visits: 2,
    pints: 4,
    recent: "Last week",
    review: "Reviewed",
    rating: "4.6",
    quote: "Best seat by the fire.",
  },
];

function StatusBar() {
  return (
    <div className="pwp-status" aria-label="9:41, full signal, Wi-Fi, battery">
      <span>9:41</span>
      <span className="pwp-status-icons" aria-hidden="true">
        <Signal size={12} fill="currentColor" /><Wifi size={12} /><BatteryFull size={15} fill="currentColor" />
      </span>
    </div>
  );
}

function DiscoveryMap() {
  return (
    <div className="pwp-map-art" role="img" aria-label="Illustrated map with nearby pub pins">
      <svg viewBox="0 0 150 118" fill="none" aria-hidden="true">
        <path d="M0 0h150v118H0z" fill="#111a1f" />
        <path d="M-7 82 29 64 49 69 67 48 91 47 110 26 156 23M-4 103 36 85 57 89 84 69 108 75 156 54M16-8 31 20 27 42 49 69 42 97 57 126M77-5 70 22 91 47 84 69 98 99 93 124M137-3 124 18 110 26 119 51 108 75 127 103" stroke="#3f5150" strokeWidth="1.2" />
        <path d="M-4 31 25 36 47 27 64 38 88 31 107 41 153 37M-9 114 35 100 57 89 84 69 107 41 124 18" stroke="#596461" strokeWidth="2.3" />
        <path d="M6 7 39 3 57 15 80 11 105 16 137 6M-7 57 23 53 44 58 66 48 91 47 118 51 153 45" stroke="#25383a" strokeWidth="5" />
        <path d="M6 7 39 3 57 15 80 11 105 16 137 6M-7 57 23 53 44 58 66 48 91 47 118 51 153 45" stroke="#304b3d" strokeWidth="3.1" />
        <path d="m38 71 6-7 7 1 2 8-6 7-7-1-2-8Zm65-40 6-7 7 1 2 8-6 7-7-1-2-8Z" fill="#5b7653" opacity=".8" />
        <circle cx="43" cy="50" r="4" fill="#d4c9a9" opacity=".7" />
        <circle cx="94" cy="89" r="3" fill="#d4c9a9" opacity=".66" />
        <g filter="url(#pwp-pin-shadow)">
          <path d="M71 17c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14Z" fill="#ffd12e" />
          <circle cx="71" cy="31" r="5" fill="#11171b" />
        </g>
        <g filter="url(#pwp-pin-shadow)">
          <path d="M119 68c-6 0-10 5-10 10 0 8 10 18 10 18s10-10 10-18c0-5-4-10-10-10Z" fill="#f0eee6" />
          <circle cx="119" cy="78" r="3.5" fill="#11171b" />
        </g>
        <defs>
          <filter id="pwp-pin-shadow" x="48" y="10" width="96" height="91" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity=".45" />
          </filter>
        </defs>
      </svg>
      <span className="pwp-map-label">SOUTH DEVON</span>
    </div>
  );
}

function PubCard({ pub, index, onReview }: { pub: Pub; index: number; onReview: (pub: Pub) => void }) {
  const reviewed = pub.review === "Reviewed";
  return (
    <article className="pwp-pub-card" style={{ animationDelay: `${index * 55}ms` }}>
      <div className="pwp-pub-photo">
        <img src={pub.image} alt={`Inside ${pub.name}, a traditional Devon pub`} />
        <span>{pub.area}</span>
      </div>
      <div className="pwp-pub-copy">
        <h3>{pub.name}</h3>
        <div className="pwp-pub-meta">
          <span>{pub.visits} visits</span><i />
          <span>{pub.pints} pints</span>
        </div>
        <div className="pwp-pub-recent"><CalendarDays size={11} /> Last visit · {pub.recent}</div>
      </div>
      <button
        className={`pwp-review-status${reviewed ? " is-reviewed" : " is-due"}`}
        type="button"
        onClick={() => onReview(pub)}
        aria-label={reviewed ? `${pub.name}, review ${pub.rating} stars` : `Write a review for ${pub.name}`}
      >
        {reviewed ? <><Star size={11} fill="currentColor" /><span>{pub.rating}</span></> : <><MessageCircle size={11} /><span>Review</span></>}
      </button>
    </article>
  );
}

function NearbySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="pwp-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pwp-sheet" role="dialog" aria-modal="true" aria-labelledby="pwp-sheet-title">
        <div className="pwp-sheet-grip" />
        <button className="pwp-sheet-close" type="button" onClick={onClose} aria-label="Close nearby suggestions"><X size={16} /></button>
        <span className="pwp-eyebrow">A LITTLE FURTHER AFIELD</span>
        <h2 id="pwp-sheet-title">A new local awaits.</h2>
        <p>Two well-loved South Devon stops, ready for your next wander.</p>
        <div className="pwp-sheet-map"><DiscoveryMap /><span className="pwp-sample-label">SAMPLE MAP · NO LOCATION USED</span></div>
        <div className="pwp-nearby-row"><span className="pwp-nearby-pin"><MapPin size={14} /></span><span><strong>The King’s Arms</strong><small>Totnes · 0.8 mi · Proper Sunday roasts</small></span><ChevronRight size={16} /></div>
        <div className="pwp-nearby-row"><span className="pwp-nearby-pin"><MapPin size={14} /></span><span><strong>The White Hart</strong><small>Dartington · 1.6 mi · Garden tables</small></span><ChevronRight size={16} /></div>
        <div className="pwp-sheet-note">Preview only · recommendations shown are sample content.</div>
        <button className="pwp-sheet-done" type="button" onClick={onClose}>Lovely, thanks</button>
      </section>
    </div>
  );
}

function BottomNav({ onPick }: { onPick: (message: string) => void }) {
  const nav = [
    { label: "Home", Icon: House },
    { label: "Wars", Icon: Flag },
    { label: "Map", Icon: Map },
    { label: "Passport", Icon: BookOpen },
    { label: "Profile", Icon: UserRound },
  ];
  return (
    <nav className="pwp-nav" aria-label="Main navigation">
      {nav.map(({ label, Icon }) => (
        <button key={label} type="button" aria-current={label === "Passport" ? "page" : undefined} className={`pwp-nav-item${label === "Passport" ? " is-current" : ""}`} onClick={() => label !== "Passport" && onPick(`${label} · visual preview only`)}>
          <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Passport() {
  const [filter, setFilter] = useState<"Visited" | "Reviews">("Visited");
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!nearbyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNearbyOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [nearbyOpen]);

  const shownPubs = filter === "Reviews" ? PUBS.filter((pub) => pub.review === "Reviewed") : PUBS;

  function handleReview(pub: Pub) {
    setToast(pub.review === "Reviewed" ? `${pub.name} · ${pub.quote}` : `Review ${pub.name} · preview only`);
  }

  return (
    <main className="pwp">
      <div className="pwp-screen">
        <StatusBar />
        <header className="pwp-header">
          <div className="pwp-brand">
            <img className="pwp-crest" src="/__mockup/images/pw-reference-crest.png" alt="" />
            <img className="pwp-wordmark" src="/__mockup/images/pw-reference-wordmark.png" alt="Pint Wars" />
            <span className="pwp-brand-divider" />
            <span className="pwp-brand-label">YOUR PUB<br />PASSPORT</span>
          </div>
          <button className="pwp-map-button" type="button" onClick={() => setNearbyOpen(true)}><Map size={13} /> Map</button>
        </header>

        <div className="pwp-content">
          <section className="pwp-intro" aria-labelledby="pwp-title">
            <div className="pwp-intro-copy"><span className="pwp-eyebrow">THE PLACES YOU’VE MADE YOURS</span><h1 id="pwp-title">Your Pub Passport</h1></div>
            <span className="pwp-passport-stamp" aria-hidden="true"><span>GOOD<br />TIMES</span><span>EST. 2024</span></span>
          </section>

          <section className="pwp-stats" aria-label="Your pub passport totals">
            <div className="pwp-total-stat"><strong>28</strong><span>PUBS VISITED</span></div>
            <div className="pwp-total-stat"><strong>56</strong><span>PINTS LOGGED</span></div>
            <div className="pwp-total-stat"><strong>14</strong><span>REVIEWS</span></div>
          </section>

          <section className="pwp-discover">
            <div className="pwp-discover-copy">
              <span className="pwp-eyebrow pwp-gold-eyebrow">EXPLORE A NEW AREA</span>
              <h2>New here?</h2>
              <p>Discover pubs you haven’t visited.</p>
              <button type="button" onClick={() => setNearbyOpen(true)}>Explore nearby pubs <ArrowRight size={14} /></button>
            </div>
            <DiscoveryMap />
            <span className="pwp-discover-rule" aria-hidden="true" />
          </section>

          <div className="pwp-list-heading">
            <div><span className="pwp-eyebrow">YOUR LITTLE BLACK BOOK</span><h2>Good places, remembered.</h2></div>
            <span className="pwp-count">{filter === "Visited" ? "28" : "14"} <small>{filter === "Visited" ? "PLACES" : "REVIEWS"}</small></span>
          </div>
          <div className="pwp-filter" role="tablist" aria-label="Passport entries">
            {(["Visited", "Reviews"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
                {item}{item === "Reviews" && <span className="pwp-filter-count">14</span>}
              </button>
            ))}
          </div>

          <section className="pwp-pub-list" aria-label={filter === "Visited" ? "Visited pubs" : "Your pub reviews"}>
            {shownPubs.map((pub, index) => <PubCard key={pub.name} pub={pub} index={index} onReview={handleReview} />)}
            <p className="pwp-list-end"><span /> End of the good ones—for now <span /></p>
          </section>
        </div>

        <BottomNav onPick={setToast} />
        <div className="pwp-home-indicator" aria-hidden="true" />
        {toast && <div className="pwp-toast" role="status">{toast}</div>}
        {nearbyOpen && <NearbySheet onClose={() => setNearbyOpen(false)} />}
      </div>
    </main>
  );
}
