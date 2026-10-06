import React, { type ReactNode } from "react";
import { ArrowLeft, BatteryFull, Signal, Wifi } from "lucide-react";
import "./flow.css";

type FlowFrameProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function FlowFrame({
  title,
  eyebrow = "NEW COMPETITION",
  description,
  children,
  footer,
}: FlowFrameProps) {
  return (
    <main className="pwcf-stage">
      <div className="pwcf-device">
        <div className="pwcf-status" aria-label="9:41, full signal, Wi-Fi, battery">
          <span>9:41</span>
          <span className="pwcf-status-icons">
            <Signal size={12} fill="currentColor" />
            <Wifi size={12} />
            <BatteryFull size={15} fill="currentColor" />
          </span>
        </div>

        <header className="pwcf-header">
          <button className="pwcf-back" type="button" aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <div className="pwcf-brand" aria-label="Pint Wars">
            <img
              className="pwcf-crest"
              src="/__mockup/images/pw-reference-crest.png"
              alt=""
            />
            <img
              className="pwcf-wordmark"
              src="/__mockup/images/pw-reference-wordmark.png"
              alt="Pint Wars"
            />
          </div>
          <span className="pwcf-header-spacer" aria-hidden="true" />
        </header>

        <section className="pwcf-heading">
          <div className="pwcf-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </section>

        <div className="pwcf-content">{children}</div>
        {footer ? <footer className="pwcf-footer">{footer}</footer> : null}
        <div className="pwcf-home-indicator" aria-hidden="true">
          <span />
        </div>
      </div>
    </main>
  );
}
