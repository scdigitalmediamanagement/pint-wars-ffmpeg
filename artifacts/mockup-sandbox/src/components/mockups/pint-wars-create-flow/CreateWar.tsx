import React from "react";
import { Minus, Plus, ShieldCheck } from "lucide-react";
import { FlowFrame } from "./_shared/FlowFrame";
import "./CreateWar.css";

const capacities = [
  { players: 6, price: "£2.99" },
  { players: 10, price: "£3.99" },
  { players: 14, price: "£4.99" },
  { players: 16, price: "£5.99" },
];

function CapacityOption({
  players,
  price,
  selected = false,
}: {
  players: number;
  price: string;
  selected?: boolean;
}) {
  return (
    <div
      className={`cw-option${selected ? " cw-option-selected" : ""}`}
      role="radio"
      aria-checked={selected}
      aria-label={`${players} players, ${price}`}
    >
      <span className="cw-radio" aria-hidden="true">
        {selected ? <span /> : null}
      </span>
      <span className="cw-option-main">
        <strong>{players} players</strong>
        {selected ? <span className="cw-recommended">SELECTED</span> : null}
      </span>
      <span className="cw-option-price">{price}</span>
    </div>
  );
}

export function CreateWar() {
  return (
    <FlowFrame
      title="Create a Pint War"
      description="Set up the competition, then invite your friends to join the crew."
      footer={
        <div className="cw-footer-content">
          <button className="pwcf-primary-button cw-continue" type="button">
            Continue
          </button>
        </div>
      }
    >
      <div className="cw-form">
        <section className="cw-section cw-name-section" aria-labelledby="cw-name-label">
          <div className="cw-section-heading">
            <label id="cw-name-label" className="cw-label" htmlFor="cw-league-name">
              LEAGUE NAME
            </label>
            <span className="cw-field-meta">GIVE YOUR CREW A NAME</span>
          </div>
          <div className="cw-name-field">
            <span className="cw-name-mark" aria-hidden="true">
              <ShieldCheck size={17} strokeWidth={1.8} />
            </span>
            <input id="cw-league-name" value="Devon Crew" readOnly aria-label="League name example" />
            <span className="cw-char-count">10 / 80</span>
          </div>
        </section>

        <section className="cw-section" aria-labelledby="cw-capacity-label">
          <div className="cw-section-heading cw-capacity-heading">
            <h2 id="cw-capacity-label" className="cw-label">PLAYER CAPACITY</h2>
            <span className="cw-section-note">ONE-TIME PRICE</span>
          </div>
          <div className="cw-options" role="radiogroup" aria-label="Player capacity and price">
            {capacities.map((option) => (
              <CapacityOption
                key={option.players}
                players={option.players}
                price={option.price}
                selected={option.players === 6}
              />
            ))}
            <div className="cw-trial-option" role="radio" aria-checked="false" aria-label="Free trial, 4 players, 10 days, Free">
              <span className="cw-radio cw-trial-radio" aria-hidden="true" />
              <span className="cw-trial-copy">
                <strong>4 players</strong>
                <span>10-day free trial</span>
              </span>
              <span className="cw-trial-price">Free</span>
            </div>
          </div>
        </section>

        <section className="cw-section cw-duration-section" aria-labelledby="cw-duration-label">
          <div className="cw-duration-head">
            <div>
              <h2 id="cw-duration-label" className="cw-label">DURATION</h2>
              <p className="cw-duration-range">Choose from 1 to 30 days</p>
            </div>
            <div className="cw-duration-control" aria-label="Example duration: 7 days">
              <span className="cw-duration-adjust" aria-hidden="true"><Minus size={14} /></span>
              <span className="cw-duration-value">7</span>
              <span className="cw-duration-unit">days</span>
              <span className="cw-duration-adjust" aria-hidden="true"><Plus size={14} /></span>
            </div>
          </div>
          <div className="cw-price-note">
            <span className="cw-price-note-mark" aria-hidden="true" />
            Price depends on player capacity, not duration.
          </div>
        </section>
      </div>
    </FlowFrame>
  );
}
