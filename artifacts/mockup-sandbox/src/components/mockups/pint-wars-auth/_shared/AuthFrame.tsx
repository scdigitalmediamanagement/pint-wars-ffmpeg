import React, { type ReactNode } from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";
import "./auth.css";

type AuthFrameProps = {
  children: ReactNode;
  className?: string;
};

export function AuthFrame({ children, className = "" }: AuthFrameProps) {
  return (
    <main className="pwa-stage">
      <div className="pwa-device">
        <div className="pwa-status" aria-label="9:41, full signal, Wi-Fi, battery">
          <span>9:41</span>
          <span className="pwa-status-icons" aria-hidden="true">
            <Signal size={12} fill="currentColor" />
            <Wifi size={12} />
            <BatteryFull size={15} fill="currentColor" />
          </span>
        </div>

        <header className="pwa-brand-header" aria-label="Pint Wars">
          <img
            className="pwa-crest"
            src="/__mockup/images/pw-reference-crest.png"
            alt=""
          />
          <img
            className="pwa-wordmark"
            src="/__mockup/images/pw-reference-wordmark.png"
            alt="Pint Wars"
          />
        </header>

        <section className={`pwa-content ${className}`.trim()}>{children}</section>

        <div className="pwa-home-indicator" aria-hidden="true">
          <span />
        </div>
      </div>
    </main>
  );
}
