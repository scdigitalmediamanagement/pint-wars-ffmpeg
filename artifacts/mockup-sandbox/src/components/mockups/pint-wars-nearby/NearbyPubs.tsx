import React, { useMemo, useState } from "react";
import {
  BatteryFull, BookOpen, Check, ChevronRight, Compass, Flag, House,
  Map, MapPin, Navigation, Search, Signal, Star, UserRound, Wifi, X,
} from "lucide-react";
import "./nearby-pubs.css";

type Pub = {
  id: string;
  name: string;
  image: string;
  distance: number;
  rating: string;
  reviews: number;
  area: string;
  visited: boolean;
  x: number;
  y: number;
};

const PUBS: Pub[] = [
  { id: "crown", name: "The Crown", image: "/__mockup/images/passport-crown.jpg", distance: 0.3, rating: "4.8", reviews: 128, area: "TOTNES", visited: false, x: 28, y: 34 },
  { id: "harbour", name: "The Harbour Arms", image: "/__mockup/images/passport-harbour-arms.jpg", distance: 0.6, rating: "4.7", reviews: 96, area: "TOTNES QUAY", visited: true, x: 69, y: 29 },
  { id: "anchor", name: "The Old Anchor", image: "/__mockup/images/passport-old-anchor.jpg", distance: 0.9, rating: "4.6", reviews: 74, area: "RIVERSIDE", visited: false, x: 76, y: 68 },
  { id: "white-hart", name: "The White Hart", image: "/__mockup/images/passport-crown.jpg", distance: 1.2, rating: "4.5", reviews: 61, area: "BRIDGETOWN", visited: false, x: 35, y: 74 },
  { id: "king-arms", name: "King’s Arms", image: "/__mockup/images/passport-old-anchor.jpg", distance: 1.5, rating: "4.4", reviews: 42, area: "TOTNES", visited: true, x: 52, y: 17 },
];

const FILTERS = ["Nearby", "Top Rated", "Not Visited"] as const;
type Filter = (typeof FILTERS)[number];

function StatusBar() {
  return (
    <div className="pwn-status" aria-label="9:41, full cellular signal, Wi-Fi and battery">
      <span>9:41</span>
      <span className="pwn-status-right" aria-hidden="true">
        <Signal size={13} strokeWidth={2.4} /><Wifi size={13} strokeWidth={2.3} /><BatteryFull size={16} strokeWidth={2.2} />
      </span>
    </div>
  );
}

function MapArtwork({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="pwn-map" role="img" aria-label="Illustrated blue-hour street map of Totnes with nearby pub markers">
      <svg className="pwn-map-lines" viewBox="0 0 390 330" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="pwn-blocks" width="94" height="82" patternUnits="userSpaceOnUse">
            <path d="M4 7h26v18H4zM39 4h43v27H39zM7 39h19v34H7zM36 44h42v28H36z" fill="#19262b" stroke="#24363a" strokeWidth="1" />
            <path d="M11 12h11M47 10h27M42 52h23" stroke="#26363a" strokeWidth="1" opacity=".75" />
          </pattern>
          <pattern id="pwn-grain" width="45" height="45" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="8" r=".7" fill="#d8cda9" opacity=".18" /><circle cx="29" cy="26" r=".5" fill="#d8cda9" opacity=".16" />
          </pattern>
        </defs>
        <rect width="390" height="330" fill="#111c22" />
        <rect width="390" height="330" fill="url(#pwn-blocks)" opacity=".94" />
        <path d="M-23 225 59 187l43 12 73-43 38 6 62-52 41 7 90-48" fill="none" stroke="#071217" strokeWidth="30" />
        <path d="M-23 225 59 187l43 12 73-43 38 6 62-52 41 7 90-48" fill="none" stroke="#475552" strokeWidth="15" />
        <path d="M-23 225 59 187l43 12 73-43 38 6 62-52 41 7 90-48" fill="none" stroke="#b1a887" strokeWidth="1.2" strokeDasharray="4 7" opacity=".45" />
        <path d="M30 -16 57 40l-8 46 39 57-12 42 49 61-5 112M165-20l-14 54 25 46-20 76 30 56-19 53 30 86M294-24l-12 60 25 42-21 55 26 60-9 54 24 65M384 7l-48 33-27 39 10 44-33 47 14 62-18 47" fill="none" stroke="#070f14" strokeWidth="18" />
        <path d="M30 -16 57 40l-8 46 39 57-12 42 49 61-5 112M165-20l-14 54 25 46-20 76 30 56-19 53 30 86M294-24l-12 60 25 42-21 55 26 60-9 54 24 65M384 7l-48 33-27 39 10 44-33 47 14 62-18 47" fill="none" stroke="#3c4b4a" strokeWidth="8" />
        <path d="M5 107 71 91l56 14 49-30 57 10 62-26 68 3M-8 286l60-29 46 5 45-34 70 9 36-24 78 2" fill="none" stroke="#263638" strokeWidth="4" />
        <path d="M4 265c74-18 122-4 172 2s117 8 222-26" fill="none" stroke="#142d32" strokeWidth="21" />
        <path d="M4 265c74-18 122-4 172 2s117 8 222-26" fill="none" stroke="#25494a" strokeWidth="13" />
        <path d="M4 265c74-18 122-4 172 2s117 8 222-26" fill="none" stroke="#54706c" strokeWidth="1" opacity=".5" />
        <path d="M18 13 70 32m168 5 65 5M111 109l36 5m65 78 58 4M38 306l52-23" stroke="#edc66b" strokeWidth="1.1" opacity=".17" />
        <rect width="390" height="330" fill="url(#pwn-grain)" />
        <text x="16" y="24" fill="#8f9993" fontSize="7" letterSpacing="1.8" fontFamily="DM Sans">TOTNES · SOUTH DEVON</text>
        <text x="298" y="302" fill="#82928c" fontSize="6" letterSpacing="1.2" fontFamily="DM Sans">RIVER DART</text>
        <text x="24" y="158" fill="#858e88" fontSize="6" letterSpacing="1.3" fontFamily="DM Sans" transform="rotate(-22 24 158)">HIGH STREET</text>
        <text x="220" y="234" fill="#89918a" fontSize="6" letterSpacing="1.1" fontFamily="DM Sans" transform="rotate(4 220 234)">BRIDGETOWN</text>
      </svg>
      <div className="pwn-map-vignette" />
      {PUBS.map((pub, i) => (
        <button
          key={pub.id}
          type="button"
          className={`pwn-marker${selectedId === pub.id ? " is-selected" : ""}${i === 0 ? " is-featured" : ""}`}
          style={{ left: `${pub.x}%`, top: `${pub.y}%` }}
          aria-label={`Show ${pub.name} on map`}
          aria-pressed={selectedId === pub.id}
          onClick={() => onSelect(pub.id)}
        >
          <MapPin size={14} fill="currentColor" strokeWidth={2.4} />
          {selectedId === pub.id && <span>{pub.name}</span>}
        </button>
      ))}
      <button type="button" className="pwn-user-dot" aria-label="Your sample location">
        <span className="pwn-user-pulse" /><span className="pwn-user-core" />
      </button>
      <div className="pwn-map-caption"><span className="pwn-live-dot" /> TOTNES TOWN CENTRE <i /> 5 LOCALS</div>
    </div>
  );
}

function BottomNav({ onPick }: { onPick: (message: string) => void }) {
  const tabs = [
    { label: "Home", Icon: House }, { label: "Wars", Icon: Flag }, { label: "Map", Icon: Map },
    { label: "Passport", Icon: BookOpen }, { label: "Profile", Icon: UserRound },
  ];
  return (
    <nav className="pwn-nav" aria-label="Main navigation">
      {tabs.map(({ label, Icon }) => (
        <button key={label} type="button" aria-current={label === "Map" ? "page" : undefined} className={`pwn-nav-item${label === "Map" ? " is-current" : ""}`} onClick={() => label !== "Map" && onPick(`${label} · visual preview only`)}>
          <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function PubCard({ pub, index, selected, onSelect, onView }: { pub: Pub; index: number; selected: boolean; onSelect: () => void; onView: () => void }) {
  return (
    <article className={`pwn-pub-card${selected ? " is-picked" : ""}`} style={{ animationDelay: `${index * 45}ms` }} onClick={onSelect}>
      <img className="pwn-pub-photo" src={pub.image} alt={`Warm evening at ${pub.name}`} />
      <div className="pwn-pub-copy">
        <div className="pwn-pub-title-row"><h3>{pub.name}</h3>{pub.visited && <span className="pwn-visited"><Check size={9} /> VISITED</span>}</div>
        <span className="pwn-pub-area">{pub.area} <i /> {pub.distance.toFixed(1)} MI</span>
        <span className="pwn-rating"><Star size={11} fill="currentColor" strokeWidth={1.5} /><strong>{pub.rating}</strong><span>({pub.reviews} reviews)</span></span>
      </div>
      <button type="button" className="pwn-view-button" onClick={(event) => { event.stopPropagation(); onView(); }}>View</button>
    </article>
  );
}

export function NearbyPubs() {
  const [filter, setFilter] = useState<Filter>("Nearby");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const shownPubs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let pubs = PUBS.filter((pub) => !needle || `${pub.name} ${pub.area}`.toLowerCase().includes(needle));
    if (filter === "Top Rated") pubs = [...pubs].sort((a, b) => Number(b.rating) - Number(a.rating));
    if (filter === "Not Visited") pubs = pubs.filter((pub) => !pub.visited);
    return pubs;
  }, [filter, query]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2000);
  }

  return (
    <main className="pwn">
      <div className="pwn-screen">
        <StatusBar />
        <header className="pwn-header">
          <div className="pwn-brand">
            <img className="pwn-crest" src="/__mockup/images/pw-reference-crest.png" alt="" />
            <img className="pwn-wordmark" src="/__mockup/images/pw-reference-wordmark.png" alt="Pint Wars" />
          </div>
          <span className="pwn-location-chip"><MapPin size={11} /> SOUTH DEVON</span>
        </header>

        <section className="pwn-discovery-head" aria-labelledby="pwn-title">
          <div className="pwn-title-copy"><span className="pwn-eyebrow">A GOOD NIGHT STARTS LOCAL</span><h1 id="pwn-title">Nearby Pubs</h1></div>
          <span className="pwn-count"><strong>{shownPubs.length}</strong> LOCALS</span>
        </section>

        <label className="pwn-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this area" aria-label="Search pubs in this area" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}
          {!query && <span className="pwn-search-shortcut">TOTNES</span>}
        </label>

        <div className="pwn-filters" role="tablist" aria-label="Filter nearby pubs">
          {FILTERS.map((item) => (
            <button key={item} role="tab" aria-selected={filter === item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
              {item === "Top Rated" && <Star size={11} fill={filter === item ? "currentColor" : "none"} />}
              {item === "Not Visited" && <Compass size={11} />}
              {item === "Nearby" && <Navigation size={10} />}
              {item}
            </button>
          ))}
        </div>

        <MapArtwork selectedId={selectedId} onSelect={(id) => { setSelectedId(id); notify(`${PUBS.find((pub) => pub.id === id)?.name} · sample map pin`); }} />

        <button type="button" className="pwn-recenter" aria-label="Recenter sample map" onClick={() => { setSelectedId(null); notify("Map centred on Totnes · sample preview"); }}>
          <Navigation size={17} strokeWidth={2.1} />
        </button>

        <section className="pwn-sheet" aria-labelledby="pwn-nearby-heading">
          <div className="pwn-sheet-handle" />
          <div className="pwn-sheet-heading">
            <div><span className="pwn-sheet-eyebrow">AROUND THE CORNER</span><h2 id="pwn-nearby-heading">Good locals nearby</h2></div>
            <span className="pwn-distance-label"><span /> 1.5 MI RADIUS</span>
          </div>
          <div className="pwn-pub-list" aria-live="polite">
            {shownPubs.length ? shownPubs.map((pub, index) => (
              <PubCard key={pub.id} pub={pub} index={index} selected={selectedId === pub.id} onSelect={() => setSelectedId(pub.id)} onView={() => { setSelectedId(pub.id); notify(`${pub.name} · pub preview only`); }} />
            )) : (
              <div className="pwn-empty"><Search size={17} /><strong>No locals found</strong><span>Try another name or area.</span></div>
            )}
            <p className="pwn-demo-note">Illustrative South Devon pubs · preview only</p>
          </div>
        </section>

        <button type="button" className="pwn-location-control" onClick={() => notify("Location controls are illustrative in this preview.")} aria-label="Current sample location">
          <span><MapPin size={13} fill="currentColor" /></span><span>Totnes, Devon</span><ChevronRight size={13} />
        </button>

        <BottomNav onPick={notify} />
        <div className="pwn-home-indicator" aria-hidden="true" />
        {toast && <div className="pwn-toast" role="status">{toast}</div>}
      </div>
    </main>
  );
}
