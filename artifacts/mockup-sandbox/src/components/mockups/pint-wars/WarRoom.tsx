import React, { useState } from "react";
import "./WarRoom.css";

const initialStops = [
  { name: "The Harp & Crown", detail: "Old Town · 0.2 mi", state: "here", note: "Your current round. Claim it while the table's still warm." },
  { name: "The Copper Fox", detail: "Market Lane · 0.6 mi", state: "next", note: "A short walk, a long-standing rivalry. Try the local pale." },
  { name: "Juniper House", detail: "West End · 1.1 mi", state: "later", note: "Last call on the route. Bring the score home." },
];

export default function WarRoom() {
  const [activeTab, setActiveTab] = useState("Route");
  const [expanded, setExpanded] = useState(0);
  const [modal, setModal] = useState(false);
  const [pints, setPints] = useState(1);
  const [logged, setLogged] = useState(2);
  const [notice, setNotice] = useState("");

  const confirmPints = () => {
    setLogged((current) => current + pints);
    setModal(false);
    setNotice(`${pints} ${pints === 1 ? "pint" : "pints"} added to tonight's tally`);
    window.setTimeout(() => setNotice(""), 2600);
  };

  return (
    <main className="warroom">
      <div className="wr-shell">
        <header className="wr-topline">
          <div className="wr-brand"><span className="wr-mark">P</span><span>Pint Wars</span></div>
          <div className="wr-date">Wed · 18 June</div>
        </header>

        <div className="wr-eyebrow">Your Wednesday, in play</div>
        <h1 className="wr-headline">A good night<br /><em>has a score.</em></h1>
        <p className="wr-subhead">One route. Three pubs. You and Maeve, neck and neck.</p>

        <section className="wr-pulse" aria-label="Live match score">
          <div className="wr-pulse-head">
            <span className="wr-live"><i className="wr-live-dot" />WAR IN PROGRESS</span>
            <span className="wr-round">ROUND 02 / 03</span>
          </div>
          <div className="wr-matchup">
            <div className="wr-player"><span className="wr-avatar">JD</span><span><b className="wr-player-name">You</b><small className="wr-player-score">{logged} pints · 2 pubs</small></span></div>
            <span className="wr-vs">against</span>
            <div className="wr-player"><span className="wr-avatar">MK</span><span><b className="wr-player-name">Maeve</b><small className="wr-player-score">3 pints · 2 pubs</small></span></div>
          </div>
          <div className="wr-scoreline"><div className="wr-scorefill" style={{ width: `${Math.min(82, 45 + logged * 4)}%` }} /></div>
          <div className="wr-score-caption"><span><b>{logged} rounds</b> logged</span><span>Maeve leads by {Math.max(0, 3 - logged)} pint</span></div>
        </section>

        <div className="wr-section-head">
          <h2 className="wr-section-title">{activeTab === "Route" ? "Tonight's route" : activeTab === "Score" ? "The standings" : "Your crew"}</h2>
          <span className="wr-section-meta">{activeTab === "Route" ? "3 stops · 1.1 mi" : activeTab === "Score" ? "Updated just now" : "4 players"}</span>
        </div>

        {activeTab === "Route" ? (
          <>
            <div className="wr-route">
              {initialStops.map((stop, index) => {
                const state = index === 0 && logged > 2 ? "visited" : stop.state;
                return <React.Fragment key={stop.name}>
                  <button className={`wr-stop ${state === "here" ? "current" : state === "visited" ? "visited" : ""}`} onClick={() => setExpanded(expanded === index ? -1 : index)} aria-expanded={expanded === index}>
                    <span className="wr-pin">{state === "visited" ? "✓" : `0${index + 1}`}</span>
                    <span className="wr-stop-copy"><b className="wr-stop-name">{stop.name}</b><small className="wr-stop-detail">{stop.detail}</small></span>
                    <span className="wr-stop-state">{state === "here" ? "AT THIS PUB" : state === "visited" ? "DONE" : index === 1 ? "UP NEXT" : "LATER"}</span>
                  </button>
                  {expanded === index && <div className="wr-stop-note">{stop.note}</div>}
                </React.Fragment>;
              })}
            </div>
            <button className="wr-log" onClick={() => { setPints(1); setModal(true); }}>
              <span>Log a pint at The Harp &amp; Crown</span><span className="wr-log-symbol">+</span>
            </button>
            <div className="wr-footnote"><span>●</span> Location confirmed · Photo proof optional</div>
          </>
        ) : activeTab === "Score" ? (
          <div className="wr-route">
            {[["01", "Maeve K.", "3 pints · 2 stops"], ["02", "You", `${logged} pints · 2 stops`], ["03", "Finn R.", "1 pint · 1 stop"], ["04", "Oisín B.", "Not started"]].map(([rank, name, detail]) => (
              <button className="wr-stop" key={rank} onClick={() => setNotice(`${name} · ${detail}`)}>
                <span className="wr-pin">{rank}</span><span className="wr-stop-copy"><b className="wr-stop-name">{name}</b><small className="wr-stop-detail">{detail}</small></span>
                <span className="wr-stop-state">{rank === "01" ? "LEADING" : ""}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="wr-route">
            {[["MK", "Maeve K.", "Host · invited you"], ["JD", "You", "Playing since 8:14"], ["FR", "Finn R.", "Last seen at The Harp"], ["OB", "Oisín B.", "On the way"]].map(([initials, name, detail]) => (
              <button className="wr-stop" key={initials} onClick={() => setNotice(`${name} · ${detail}`)}>
                <span className="wr-avatar">{initials}</span><span className="wr-stop-copy"><b className="wr-stop-name">{name}</b><small className="wr-stop-detail">{detail}</small></span><span className="wr-stop-state">›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="wr-bottom" aria-label="War navigation">
        {[["Route", "⌁"], ["Score", "≋"], ["Crew", "◉"]].map(([label, icon]) => (
          <button key={label} onClick={() => setActiveTab(label)} className={`wr-nav ${activeTab === label ? "active" : ""}`}><span className="wr-nav-icon">{icon}</span>{label}</button>
        ))}
      </nav>

      {notice && <div role="status" style={{ position: "fixed", zIndex: 12, left: "50%", bottom: 78, transform: "translateX(-50%)", background: "#1f3437", color: "#fbf8ef", borderRadius: 3, padding: "11px 16px", fontSize: 11, whiteSpace: "nowrap" }}>{notice}</div>}

      {modal && <div className="wr-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
        <section className="wr-modal" role="dialog" aria-modal="true" aria-labelledby="wr-modal-title">
          <div className="wr-modal-grip" />
          <div className="wr-modal-kicker">Proof of a good night</div>
          <h2 id="wr-modal-title" className="wr-modal-title">Log your round.</h2>
          <div className="wr-modal-place"><b>The Harp &amp; Crown</b><small>0.2 mi away · Location verified</small></div>
          <label className="wr-modal-label">How many pints?</label>
          <div className="wr-pint-count">
            <button className="wr-step" aria-label="Remove one pint" onClick={() => setPints((count) => Math.max(1, count - 1))}>−</button>
            <span className="wr-count">{pints} <small style={{ font: "11px sans-serif", color: "#78817a" }}>{pints === 1 ? "pint" : "pints"}</small></span>
            <button className="wr-step" aria-label="Add one pint" onClick={() => setPints((count) => Math.min(6, count + 1))}>+</button>
          </div>
          <button className="wr-log wr-confirm" onClick={confirmPints}>Add to the war tally <span>→</span></button>
        </section>
      </div>}
    </main>
  );
}
