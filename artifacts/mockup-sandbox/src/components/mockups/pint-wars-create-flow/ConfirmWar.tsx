import React from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { FlowFrame } from "./_shared/FlowFrame";
import "./ConfirmWar.css";

type PaidCapacity = 6 | 10 | 14 | 16;
type PintWarPlan =
  | { kind: "paid"; capacity: PaidCapacity; durationDays: number; price: string }
  | { kind: "free"; capacity: 4; durationDays: 10; price: "Free" };

const selectedPlan: PintWarPlan = {
  kind: "paid",
  capacity: 6,
  durationDays: 7,
  price: "£2.99",
};

const pintWarName = "Devon Crew";

function getCtaLabel(plan: PintWarPlan) {
  return plan.kind === "free"
    ? "Create Free Pint War"
    : `Purchase ${plan.capacity}-player Pint War`;
}

export function ConfirmWar() {
  const isPaid = selectedPlan.kind === "paid";

  return (
    <FlowFrame
      eyebrow={isPaid ? "READY FOR THE OFF" : "FREE PINT WAR"}
      title="Confirm your Pint War"
      description="One last look at the details. Get your crew together and make it a night to remember."
      footer={
        <>
          {isPaid ? (
            <div className="pwconfirm-footer-note">
              <CreditCard size={12} strokeWidth={1.8} />
              <span>ONE-TIME PURCHASE · NOT A SUBSCRIPTION</span>
            </div>
          ) : null}
          <button className="pwcf-primary-button pwconfirm-cta" type="button">
            <span>{getCtaLabel(selectedPlan)}</span>
            <Check size={17} strokeWidth={2.4} />
          </button>
        </>
      }
    >
      <div className="pwcf-content pwconfirm-content">
        <p className="pwconfirm-intro">
          The details are set. Here’s the Pint War you’re bringing to the table.
        </p>

        <section className="pwconfirm-card" aria-label="Pint War summary">
          <div className="pwconfirm-card-top">
            <span className="pwconfirm-kicker">PINT WARS · COMPETITION SUMMARY</span>
            <span className="pwconfirm-ready">
              <i className="pwconfirm-ready-mark" />
              READY TO START
            </span>
          </div>

          <h2 className="pwconfirm-name">{pintWarName}</h2>
          <div className="pwconfirm-subline">
            <ShieldCheck size={13} strokeWidth={1.8} />
            <span>Your crew’s Pint War</span>
          </div>

          <div className="pwconfirm-rule" />

          <div className="pwconfirm-facts">
            <div className="pwconfirm-fact">
              <span className="pwconfirm-fact-label">
                <UsersRound size={12} /> CAPACITY
              </span>
              <strong className="pwconfirm-fact-value">
                {selectedPlan.capacity} <em>players</em>
              </strong>
            </div>
            <div className="pwconfirm-fact">
              <span className="pwconfirm-fact-label">
                <CalendarDays size={12} /> DURATION
              </span>
              <strong className="pwconfirm-fact-value">
                {selectedPlan.durationDays} <em>days</em>
              </strong>
            </div>
            <div className="pwconfirm-fact">
              <span className="pwconfirm-fact-label">
                <Clock3 size={12} /> FORMAT
              </span>
              <strong className="pwconfirm-fact-value">
                {selectedPlan.kind === "free" ? "Free trial" : "One-time"}
              </strong>
            </div>
            <div className="pwconfirm-fact">
              <span className="pwconfirm-fact-label">
                <CreditCard size={12} /> PRICE
              </span>
              <strong className="pwconfirm-fact-value">{selectedPlan.price}</strong>
            </div>
          </div>

          {isPaid ? (
            <div className="pwconfirm-purchase">
              <div className="pwconfirm-purchase-copy">
                <strong className="pwconfirm-purchase-label">ONE-TIME PURCHASE</strong>
                <span className="pwconfirm-purchase-note">Not a subscription</span>
              </div>
              <strong className="pwconfirm-price">{selectedPlan.price}</strong>
            </div>
          ) : null}
        </section>

        <div className="pwconfirm-assurance">
          <ShieldCheck size={15} strokeWidth={1.7} />
          <span>
            {isPaid ? (
              <>
                A single purchase for this <strong>{selectedPlan.capacity}-player Pint War</strong>.
              </>
            ) : (
              <>
                <strong>4 players · 10 days · Free.</strong> Your trial Pint War is ready.
              </>
            )}
          </span>
        </div>
      </div>
    </FlowFrame>
  );
}

export default ConfirmWar;
