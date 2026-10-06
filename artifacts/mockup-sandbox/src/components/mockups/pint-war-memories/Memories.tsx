import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  BatteryFull,
  Check,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Film,
  MapPin,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Signal,
  Trophy,
  Wifi,
  X,
} from "lucide-react";
import "./Memories.css";

type GenerationState = "ready" | "generating" | "failed";
type MemoriesProps = {
  /** The completed MP4 supplied by the real app's Memories generation flow. */
  mp4Url?: string;
  onBack?: () => void;
};

type ShareDataWithFiles = {
  title: string;
  text: string;
  files: File[];
};

type FileShareNavigator = Navigator & {
  canShare?: (data: ShareDataWithFiles) => boolean;
  share?: (data: ShareDataWithFiles) => Promise<void>;
};

type Moment = {
  title: string;
  player: string;
  pub: string;
  time: number;
  image: string;
  alt: string;
};

const MOMENTS: Moment[] = [
  {
    title: "First round",
    player: "Jack",
    pub: "The Crown",
    time: 3,
    image: "/__mockup/images/pint-war-memories-moment-toast.png",
    alt: "The crew share the first toast of the night at a warmly lit pub",
  },
  {
    title: "The story",
    player: "Sophie",
    pub: "Harbour Arms",
    time: 11,
    image: "/__mockup/images/pint-war-memories-moment-story.png",
    alt: "Sophie tells a story while the crew laugh beside a rain-speckled window",
  },
  {
    title: "Last stop",
    player: "Ryan",
    pub: "The Old Anchor",
    time: 19,
    image: "/__mockup/images/pint-war-memories-moment-laststop.png",
    alt: "The Devon Crew arrive together at their last pub of the evening",
  },
  {
    title: "Winner's cup",
    player: "Tom",
    pub: "The Seven Stars",
    time: 27,
    image: "/__mockup/images/pint-war-memories-moment-winner.png",
    alt: "Tom lifts the small brass winner's cup while his friends applaud",
  },
];

const VIDEO_TITLE = "Devon-Crew-Pint-War-Memories.mp4";

function StatusBar() {
  return (
    <div className="pwm-status" aria-label="9:41, full cellular signal, Wi-Fi and battery">
      <span>9:41</span>
      <span className="pwm-status-right" aria-hidden="true">
        <Signal size={13} strokeWidth={2.4} />
        <Wifi size={13} strokeWidth={2.3} />
        <BatteryFull size={16} strokeWidth={2.2} />
      </span>
    </div>
  );
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function Memories({ mp4Url, onBack }: MemoriesProps = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>("ready");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [activeMoment, setActiveMoment] = useState(0);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const videoUrl = localVideoUrl || mp4Url || "";
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  useEffect(() => {
    if (!localVideoUrl) return;
    return () => URL.revokeObjectURL(localVideoUrl);
  }, [localVideoUrl]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen && !shareSheetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setShareSheetOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen, shareSheetOpen]);

  function requestLocalMp4(message: string) {
    setNotice(message);
    fileInputRef.current?.click();
  }

  function handleVideoFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setNotice("Choose the generated MP4 file to continue.");
      return;
    }

    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    const objectUrl = URL.createObjectURL(file);
    setLocalFile(file);
    setLocalVideoUrl(objectUrl);
    setGenerationState("ready");
    setCurrentTime(0);
    setNotice("Your MP4 is ready to watch, save, or share.");
  }

  async function togglePlayback() {
    if (generationState !== "ready") return;
    const video = videoRef.current;
    if (!videoUrl || !video) {
      requestLocalMp4("Choose the generated MP4 to watch this memory film.");
      return;
    }

    if (video.paused) {
      try {
        await video.play();
      } catch {
        setNotice("This MP4 could not be played. Try attaching it again.");
      }
    } else {
      video.pause();
    }
  }

  function saveVideo() {
    if (generationState !== "ready") return;
    if (!videoUrl) {
      requestLocalMp4("Choose the generated MP4 to save it to your device.");
      return;
    }

    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = localFile?.name || VIDEO_TITLE;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice("Your Memories MP4 is ready to save.");
  }

  async function getShareFile() {
    if (localFile) return localFile;
    if (!mp4Url) return null;
    const response = await fetch(mp4Url);
    if (!response.ok) throw new Error("Unable to load the Memories MP4.");
    const blob = await response.blob();
    return new File([blob], VIDEO_TITLE, { type: "video/mp4" });
  }

  async function shareVideo() {
    if (generationState !== "ready") return;
    if (!videoUrl) {
      requestLocalMp4("Choose the generated MP4 to share it with your crew.");
      return;
    }

    try {
      const file = await getShareFile();
      if (!file) {
        setNotice("The generated MP4 is not available yet.");
        return;
      }
      const shareData: ShareDataWithFiles = {
        title: "Devon Crew — Pint War Memories",
        text: "One crew. Eight stops. One final whistle.",
        files: [file],
      };
      const shareNavigator = navigator as FileShareNavigator;
      if (shareNavigator.share && (!shareNavigator.canShare || shareNavigator.canShare(shareData))) {
        await shareNavigator.share(shareData);
        return;
      }
      setShareSheetOpen(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("We couldn't open the share sheet. Try saving the MP4 instead.");
    }
  }

  function selectMoment(moment: Moment, index: number) {
    setActiveMoment(index);
    if (generationState !== "ready") return;
    if (!videoUrl || !videoRef.current) {
      requestLocalMp4(`Choose the MP4 to jump to “${moment.title}”.`);
      return;
    }
    videoRef.current.currentTime = moment.time;
    setCurrentTime(moment.time);
    void videoRef.current.play();
  }

  function showPreviewState(state: GenerationState) {
    setGenerationState(state);
    setMenuOpen(false);
    setPlaying(false);
    if (state === "generating") setCurrentTime(0);
  }

  function retryGeneration() {
    setGenerationState("generating");
    setNotice("Rebuilding a sample Memories film.");
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => {
      setGenerationState("ready");
      setNotice("Your Memories film is ready.");
    }, 2100);
  }

  return (
    <main className="pwm">
      <div className="pwm-screen">
        <StatusBar />
        <header className="pwm-header">
          <button
            className="pwm-back"
            type="button"
            aria-label="Back to completed Pint War"
            onClick={() => {
              if (onBack) onBack();
              else setNotice("Back to Devon Crew's completed war.");
            }}
          >
            <ArrowLeft size={18} strokeWidth={2.1} />
          </button>
          <h1>Pint War Memories</h1>
          <button
            className="pwm-more"
            type="button"
            aria-label="Open video preview options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="pwm-state-menu" role="menu" aria-label="Preview generation states">
              <div className="pwm-state-menu-heading">
                <span>DESIGN PREVIEW</span>
                <button type="button" aria-label="Close preview options" onClick={() => setMenuOpen(false)}>
                  <X size={14} />
                </button>
              </div>
              <p>View video generation states</p>
              <button type="button" role="menuitem" onClick={() => showPreviewState("ready")}>
                <span className="pwm-menu-state-dot is-ready" />
                Ready to watch
                {generationState === "ready" && <Check size={14} />}
              </button>
              <button type="button" role="menuitem" onClick={() => showPreviewState("generating")}>
                <span className="pwm-menu-state-dot is-loading" />
                Making the film
                {generationState === "generating" && <Check size={14} />}
              </button>
              <button type="button" role="menuitem" onClick={() => showPreviewState("failed")}>
                <span className="pwm-menu-state-dot is-failed" />
                Needs a retry
                {generationState === "failed" && <Check size={14} />}
              </button>
              <button
                className="pwm-state-menu-file"
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                <Film size={14} />
                Attach a real MP4
              </button>
            </div>
          )}
        </header>

        <input
          ref={fileInputRef}
          className="pwm-file-input"
          type="file"
          accept="video/mp4,.mp4"
          aria-label="Choose a generated Memories MP4"
          onChange={handleVideoFileChange}
        />

        <div className="pwm-content">
          <div className="pwm-war-heading">
            <div>
              <p className="pwm-eyebrow">A WEEK TO REMEMBER</p>
              <h2>Devon Crew</h2>
            </div>
            <span className="pwm-completed-pill"><Check size={11} /> COMPLETED</span>
          </div>
          <div className="pwm-war-meta">
            <span><span className="pwm-meta-dot" /> SIX PLAYERS</span>
            <span>·</span>
            <span>EIGHT LOCAL PUBS</span>
            <span>·</span>
            <span>FINAL WHISTLE</span>
          </div>

          <section className={`pwm-player pwm-player--${generationState}`} aria-label="Devon Crew Memories video player">
            <video
              ref={videoRef}
              className="pwm-video"
              src={videoUrl || undefined}
              poster="/__mockup/images/pint-war-memories-hero.png"
              playsInline
              preload={videoUrl ? "metadata" : "none"}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onLoadedMetadata={(event) => {
                const videoDuration = event.currentTarget.duration;
                if (Number.isFinite(videoDuration) && videoDuration > 0) setDuration(videoDuration);
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              aria-label="30-second Devon Crew highlight video"
            />
            <div className="pwm-player-shade" aria-hidden="true" />
            <span className="pwm-film-mark"><Clapperboard size={12} /> MEMORY FILM</span>
            <span className="pwm-quality-mark">30 SEC <i /> HD</span>

            {generationState === "ready" && (
              <button
                className={`pwm-play${playing ? " is-playing" : ""}`}
                type="button"
                aria-label={playing ? "Pause Memories video" : "Play Memories video"}
                onClick={() => { void togglePlayback(); }}
              >
                {playing ? <Pause size={19} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
            )}

            {generationState === "generating" && (
              <div className="pwm-generation-state" role="status" aria-live="polite">
                <span className="pwm-loader-ring" aria-hidden="true" />
                <span className="pwm-generation-kicker">GATHERING THE GOOD BITS</span>
                <strong>Your film is taking shape.</strong>
                <span className="pwm-generation-copy">The crew’s best moments, cut into one 30-second keepsake.</span>
                <span className="pwm-generation-progress"><i /></span>
                <span className="pwm-generation-time">ABOUT 20 SECONDS LEFT</span>
              </div>
            )}

            {generationState === "failed" && (
              <div className="pwm-failure-state" role="alert">
                <span className="pwm-failure-icon"><CircleAlert size={19} /></span>
                <span className="pwm-generation-kicker">THE NIGHT IS STILL YOURS</span>
                <strong>We couldn’t finish the film.</strong>
                <span className="pwm-generation-copy">Your war is safe. Give the highlight another go.</span>
                <button type="button" onClick={retryGeneration}>
                  <RotateCcw size={14} /> Try again
                </button>
              </div>
            )}
          </section>

          <div className="pwm-film-details">
            <div>
              <h3>30 second highlight video</h3>
              <span>{videoUrl ? "MP4 READY TO PLAY" : "GENERATED MP4"} <i /> 1080P</span>
            </div>
            <span className="pwm-file-type">.MP4</span>
          </div>

          <section className={`pwm-timeline${generationState !== "ready" ? " is-inactive" : ""}`} aria-label="Video timeline">
            <div className="pwm-timeline-time">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              className="pwm-range"
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={Math.min(currentTime, duration)}
              disabled={!videoUrl || generationState !== "ready"}
              aria-label="Seek through Devon Crew Memories video"
              style={{ "--pwm-progress": `${progress}%` } as React.CSSProperties}
              onChange={(event) => {
                const nextTime = Number(event.currentTarget.value);
                setCurrentTime(nextTime);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
              }}
            />
            <div className="pwm-timeline-markers" aria-hidden="true">
              <span>THE FIRST TOAST</span>
              <span>THE FINAL CUP</span>
            </div>
          </section>

          {generationState === "ready" ? (
            <div className="pwm-actions" aria-label="Memories video actions">
              <button className="pwm-save" type="button" onClick={saveVideo}>
                <ArrowDownToLine size={17} />
                Save Video
              </button>
              <button className="pwm-share" type="button" onClick={() => { void shareVideo(); }}>
                <Share2 size={17} />
                Share Video
                <ChevronRight className="pwm-share-chevron" size={14} />
              </button>
            </div>
          ) : (
            <div className="pwm-actions pwm-actions--disabled" aria-label="Video actions unavailable while the film is not ready">
              <button className="pwm-save" type="button" disabled><ArrowDownToLine size={17} />Save Video</button>
              <button className="pwm-share" type="button" disabled><Share2 size={17} />Share Video</button>
            </div>
          )}

          {generationState === "ready" && (
            <>
              <section className="pwm-moments" aria-labelledby="pwm-moments-title">
                <div className="pwm-section-heading">
                  <div>
                    <span className="pwm-section-eyebrow">THE STORY OF THE WAR</span>
                    <h3 id="pwm-moments-title">Little moments. Big night.</h3>
                  </div>
                  <span className="pwm-moment-count">04 CUTS</span>
                </div>
                <div className="pwm-moment-strip" aria-label="Selected moments from the video">
                  {MOMENTS.map((moment, index) => (
                    <button
                      className={`pwm-moment${activeMoment === index ? " is-active" : ""}`}
                      type="button"
                      key={moment.title}
                      aria-pressed={activeMoment === index}
                      aria-label={`Jump to ${moment.title} with ${moment.player} at ${moment.pub}, ${formatTime(moment.time)}`}
                      onClick={() => selectMoment(moment, index)}
                    >
                      <span className="pwm-moment-image-wrap">
                        <img src={moment.image} alt={moment.alt} />
                        <span className="pwm-moment-time">{formatTime(moment.time)}</span>
                        {activeMoment === index && <span className="pwm-moment-selected"><Check size={10} /></span>}
                      </span>
                      <span className="pwm-moment-title">{moment.title}</span>
                      <span className="pwm-moment-meta">{moment.player} <i /> <MapPin size={9} /> {moment.pub}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="pwm-closing-card" aria-label="Devon Crew final result">
                <img
                  src="/__mockup/images/pint-war-memories-moment-winner.png"
                  alt="Tom raises the brass winner's cup as the crew celebrates"
                />
                <div className="pwm-closing-shade" aria-hidden="true" />
                <div className="pwm-closing-copy">
                  <span className="pwm-closing-kicker"><Trophy size={11} /> THE FINAL WHISTLE</span>
                  <strong>Tom took the cup.</strong>
                  <span>Four points clear. Six mates still at the table.</span>
                </div>
                <span className="pwm-closing-score">14 <small>PTS</small></span>
              </section>

              <div className="pwm-crew-footer">
                <div className="pwm-crew-avatars" aria-label="Devon Crew: Tom, Jack, Steven, Ryan, Mike and Sophie">
                  <span className="pwm-avatar pwm-avatar-tom">TM</span>
                  <span className="pwm-avatar pwm-avatar-jack">JK</span>
                  <span className="pwm-avatar pwm-avatar-you">YOU</span>
                  <span className="pwm-avatar pwm-avatar-ryan">RY</span>
                  <span className="pwm-avatar pwm-avatar-mike">MK</span>
                  <span className="pwm-avatar pwm-avatar-sophie">SP</span>
                </div>
                <span>Made to be kept.</span>
              </div>
            </>
          )}
        </div>

        <div className="pwm-home-indicator" aria-hidden="true"><i /></div>
        {notice && <div className="pwm-notice" role="status" aria-live="polite">{notice}</div>}
      </div>

      {shareSheetOpen && (
        <div
          className="pwm-share-backdrop"
          role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget) setShareSheetOpen(false); }}
        >
          <section className="pwm-share-sheet" role="dialog" aria-modal="true" aria-labelledby="pwm-share-title">
            <div className="pwm-sheet-grip" />
            <button className="pwm-sheet-close" type="button" aria-label="Close share options" onClick={() => setShareSheetOpen(false)}>
              <X size={17} />
            </button>
            <span className="pwm-sheet-icon"><Share2 size={18} /></span>
            <span className="pwm-section-eyebrow">PASS IT ROUND</span>
            <h2 id="pwm-share-title">Share the whole night.</h2>
            <p>The MP4 is ready to send. On iPhone, Share Video opens the native share sheet with the file attached.</p>
            <button className="pwm-sheet-save" type="button" onClick={() => { setShareSheetOpen(false); saveVideo(); }}>
              <ArrowDownToLine size={16} /> Save MP4 instead
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

export default Memories;
